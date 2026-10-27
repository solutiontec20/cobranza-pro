-- ============================================================
-- ADMIN DAILY CONTROL REPORT
-- ============================================================
-- Backs the "control-diario" screen (modules/admin/daily-control),
-- which until now ran entirely on hardcoded fixture data
-- (core/adapters/in-memory-daily-control.repository.ts). This
-- function replaces that fixture with a real, point-in-time
-- report computed from the actual schedule/payment data.
--
-- Unlike `public.installment_balances` / `public.customer_financial_status`
-- (which always represent "right now", via
-- `(now() at time zone 'America/Lima')::date`), this screen lets an
-- admin/supervisor pick ANY cut-off date in the date picker — so
-- every amount here must be computed "as of p_business_date", not
-- "as of today". That rules out simply reusing those two views: a
-- payment made after the chosen cut-off date must not count as
-- "already paid" for that date's report.
--
-- Only currently-active (non-superseded) installments are
-- considered, matching `installment_balances`'s own behavior
-- after a schedule replacement (`admin_update_loan`) — a loan's
-- historical report always reflects its latest schedule, the same
-- way the rest of the app already does.
-- ============================================================

create or replace function public.admin_daily_control_report(
  p_business_date date,
  p_collector_id uuid default null
)
returns table (
  loan_id uuid,
  customer_id uuid,
  client_dni text,
  client_name text,
  collector_id uuid,
  collector_name text,
  principal_amount numeric(12,2),
  total_amount numeric(12,2),
  started_on date,
  end_date date,
  installment_amount numeric(12,2),
  scheduled_on_date numeric(12,2),
  collected_on_date numeric(12,2),
  paid_to_date numeric(12,2),
  balance_as_of numeric(12,2),
  oldest_unpaid_due_date date,
  overdue_days integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
begin

  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select private.current_app_role() into v_role;

  if v_role is null then
    raise exception 'Active application profile required'
      using errcode = '42501';
  end if;

  if v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception 'Only administrators or supervisors may view the daily control report'
      using errcode = '42501';
  end if;

  if p_business_date is null then
    raise exception 'Business date is required'
      using errcode = '22023';
  end if;

  return query
  with active_installments as (
    select
      i.id,
      i.loan_id,
      i.installment_number,
      i.due_date,
      i.scheduled_amount
    from public.installments i
    where i.superseded_at is null
  ),
  allocation_as_of as (
    select
      ai.id as installment_id,
      coalesce(
        sum(pa.amount) filter (
          where p.status = 'posted'::public.payment_status
            and p.business_date <= p_business_date
        ),
        0
      )::numeric(12,2) as paid_as_of,
      coalesce(
        sum(pa.amount) filter (
          where p.status = 'posted'::public.payment_status
            and p.business_date = p_business_date
        ),
        0
      )::numeric(12,2) as collected_on_date
    from active_installments ai
    left join public.payment_allocations pa
      on pa.installment_id = ai.id
      and pa.superseded_at is null
    left join public.payments p
      on p.id = pa.payment_id
    group by ai.id
  ),
  installment_state as (
    select
      ai.loan_id,
      ai.due_date,
      ai.scheduled_amount,
      aa.paid_as_of,
      aa.collected_on_date,
      greatest(
        ai.scheduled_amount - aa.paid_as_of,
        0
      )::numeric(12,2) as outstanding_as_of
    from active_installments ai
    join allocation_as_of aa
      on aa.installment_id = ai.id
  ),
  loan_state as (
    select
      s.loan_id,
      coalesce(
        sum(s.scheduled_amount) filter (where s.due_date = p_business_date),
        0
      )::numeric(12,2) as scheduled_on_date,
      coalesce(sum(s.collected_on_date), 0)::numeric(12,2) as collected_on_date,
      coalesce(sum(s.paid_as_of), 0)::numeric(12,2) as paid_to_date,
      min(s.due_date) filter (
        where s.due_date < p_business_date and s.outstanding_as_of > 0
      ) as oldest_unpaid_due_date,
      max(s.due_date) as end_date
    from installment_state s
    group by s.loan_id
  )
  select
    l.id as loan_id,
    c.id as customer_id,
    c.document_number as client_dni,
    c.full_name as client_name,
    c.collector_id,
    pr.full_name as collector_name,
    l.principal_amount,
    l.total_amount,
    l.started_on,
    coalesce(ls.end_date, l.started_on) as end_date,
    coalesce(
      (
        select ai.scheduled_amount
        from active_installments ai
        where ai.loan_id = l.id
        order by ai.installment_number asc
        limit 1
      ),
      0
    )::numeric(12,2) as installment_amount,
    coalesce(ls.scheduled_on_date, 0)::numeric(12,2) as scheduled_on_date,
    coalesce(ls.collected_on_date, 0)::numeric(12,2) as collected_on_date,
    coalesce(ls.paid_to_date, 0)::numeric(12,2) as paid_to_date,
    greatest(
      l.total_amount - coalesce(ls.paid_to_date, 0),
      0
    )::numeric(12,2) as balance_as_of,
    ls.oldest_unpaid_due_date,
    case
      when ls.oldest_unpaid_due_date is null then 0
      else (p_business_date - ls.oldest_unpaid_due_date)
    end::integer as overdue_days
  from public.loans l
  join public.customers c
    on c.id = l.customer_id
  join public.profiles pr
    on pr.id = c.collector_id
  left join loan_state ls
    on ls.loan_id = l.id
  where (p_collector_id is null or c.collector_id = p_collector_id)
  order by c.full_name asc;
end;
$$;

revoke execute
on function public.admin_daily_control_report(date, uuid)
from public, anon;

grant execute
on function public.admin_daily_control_report(date, uuid)
to authenticated;
