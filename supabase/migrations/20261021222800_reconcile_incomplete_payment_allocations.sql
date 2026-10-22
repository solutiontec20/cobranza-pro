-- ============================================================
-- COBRANZAPRO - RECONCILE INCOMPLETE PAYMENT ALLOCATIONS
-- ============================================================

create or replace function private.repair_incomplete_payment_allocations()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loan_id uuid;
  v_payment record;
  v_installment record;
  v_posted_total numeric(12,2);
  v_allocated_total numeric(12,2);
  v_remaining numeric(12,2);
  v_outstanding numeric(12,2);
  v_allocation numeric(12,2);
  v_superseded_at timestamptz;
  v_repaired_count integer := 0;
begin
  for v_loan_id in
    with posted_totals as (
      select
        p.loan_id,
        sum(p.amount)::numeric(12,2) as posted_total
      from public.payments p
      where p.status = 'posted'::public.payment_status
      group by p.loan_id
    ),
    active_allocation_totals as (
      select
        p.loan_id,
        sum(pa.amount)::numeric(12,2) as allocated_total
      from public.payment_allocations pa
      join public.payments p
        on p.id = pa.payment_id
      join public.installments i
        on i.id = pa.installment_id
      where pa.superseded_at is null
        and p.status = 'posted'::public.payment_status
        and i.superseded_at is null
      group by p.loan_id
    )
    select pt.loan_id
    from posted_totals pt
    left join active_allocation_totals aat
      on aat.loan_id = pt.loan_id
    where pt.posted_total <> coalesce(aat.allocated_total, 0)
       or exists (
         select 1
         from public.payment_allocations pa
         join public.payments p
           on p.id = pa.payment_id
         join public.installments i
           on i.id = pa.installment_id
         where p.loan_id = pt.loan_id
           and pa.superseded_at is null
           and i.superseded_at is not null
       )
    order by pt.loan_id
  loop
    perform 1
    from public.loans l
    where l.id = v_loan_id
    for update;

    perform i.id
    from public.installments i
    where i.loan_id = v_loan_id
      and i.superseded_at is null
    order by i.installment_number
    for update;

    perform p.id
    from public.payments p
    where p.loan_id = v_loan_id
    order by p.paid_at, p.created_at, p.id
    for update;

    select coalesce(sum(p.amount), 0)::numeric(12,2)
      into v_posted_total
    from public.payments p
    where p.loan_id = v_loan_id
      and p.status = 'posted'::public.payment_status;

    select coalesce(sum(pa.amount), 0)::numeric(12,2)
      into v_allocated_total
    from public.payment_allocations pa
    join public.payments p
      on p.id = pa.payment_id
    join public.installments i
      on i.id = pa.installment_id
    where p.loan_id = v_loan_id
      and p.status = 'posted'::public.payment_status
      and pa.superseded_at is null
      and i.superseded_at is null;

    if v_posted_total = v_allocated_total
       and not exists (
         select 1
         from public.payment_allocations pa
         join public.payments p
           on p.id = pa.payment_id
         join public.installments i
           on i.id = pa.installment_id
         where p.loan_id = v_loan_id
           and pa.superseded_at is null
           and i.superseded_at is not null
       )
    then
      continue;
    end if;

    if v_posted_total > (
      select coalesce(sum(i.scheduled_amount), 0)
      from public.installments i
      where i.loan_id = v_loan_id
        and i.superseded_at is null
    ) then
      raise exception
        'Posted payments exceed the active schedule total for loan %',
        v_loan_id
        using errcode = '22023';
    end if;

    perform set_config(
      'app.audit_reason',
      'Reconcile incomplete payment allocations with posted payment history',
      true
    );

    v_superseded_at := clock_timestamp();

    update public.payment_allocations pa
    set
      superseded_at = v_superseded_at,
      supersession_reason =
        'Rebuilt from complete posted payment history'
    from public.payments p
    where p.id = pa.payment_id
      and p.loan_id = v_loan_id
      and pa.superseded_at is null;

    for v_payment in
      select p.id, p.amount
      from public.payments p
      where p.loan_id = v_loan_id
        and p.status = 'posted'::public.payment_status
      order by p.paid_at, p.created_at, p.id
    loop
      v_remaining := v_payment.amount;

      for v_installment in
        select i.id, i.scheduled_amount
        from public.installments i
        where i.loan_id = v_loan_id
          and i.superseded_at is null
        order by i.installment_number
      loop
        select greatest(
          v_installment.scheduled_amount - coalesce(sum(pa.amount), 0),
          0
        )::numeric(12,2)
          into v_outstanding
        from public.payment_allocations pa
        join public.payments p
          on p.id = pa.payment_id
        where pa.installment_id = v_installment.id
          and pa.superseded_at is null
          and p.status = 'posted'::public.payment_status;

        continue when v_outstanding <= 0;
        exit when v_remaining <= 0;

        v_allocation := least(v_remaining, v_outstanding);

        insert into public.payment_allocations (
          payment_id,
          installment_id,
          amount
        )
        values (
          v_payment.id,
          v_installment.id,
          v_allocation
        );

        v_remaining := v_remaining - v_allocation;
      end loop;

      if v_remaining <> 0 then
        raise exception
          'Unable to reconcile payment % for loan %',
          v_payment.id,
          v_loan_id
          using errcode = '22023';
      end if;
    end loop;

    select coalesce(sum(pa.amount), 0)::numeric(12,2)
      into v_allocated_total
    from public.payment_allocations pa
    join public.payments p
      on p.id = pa.payment_id
    join public.installments i
      on i.id = pa.installment_id
    where p.loan_id = v_loan_id
      and p.status = 'posted'::public.payment_status
      and pa.superseded_at is null
      and i.superseded_at is null;

    if v_allocated_total <> v_posted_total then
      raise exception
        'Reconciled allocation total does not match posted payments for loan %',
        v_loan_id
        using errcode = '22023';
    end if;

    v_repaired_count := v_repaired_count + 1;
  end loop;

  return v_repaired_count;
end;
$$;

revoke all
on function private.repair_incomplete_payment_allocations()
from public;

select private.repair_incomplete_payment_allocations();

