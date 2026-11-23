-- ============================================================
-- ATOMIC BULK PAYMENT VOIDING
-- ============================================================
-- Administrators and supervisors can reverse multiple posted
-- payments from one loan without risking a partially applied
-- batch. The existing void_payment RPC remains the single source
-- of truth for each payment's audit fields, cash reversal, balance
-- recalculation, and paid-loan reopening behavior.
-- ============================================================

create or replace function public.void_payments_bulk(
  p_loan_id uuid,
  p_payment_ids uuid[],
  p_reason text
)
returns table (
  loan_id uuid,
  voided_count integer,
  voided_amount numeric(12,2),
  remaining_balance numeric(12,2)
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role public.app_role;
  v_requested_count integer;
  v_distinct_count integer;
  v_locked_count integer;
  v_selected_amount numeric(12,2);
  v_payment_id uuid;
  v_remaining_balance numeric(12,2);
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select private.current_app_role()
    into v_role;

  if v_role not in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  ) then
    raise exception 'Only administrators or supervisors may void payments'
      using errcode = '42501';
  end if;

  if p_loan_id is null then
    raise exception 'Loan is required'
      using errcode = '22023';
  end if;

  v_requested_count := cardinality(p_payment_ids);

  if v_requested_count is null or v_requested_count = 0 then
    raise exception 'At least one payment must be selected'
      using errcode = '22023';
  end if;

  if v_requested_count > 100 then
    raise exception 'A maximum of 100 payments may be voided at once'
      using errcode = '22023';
  end if;

  if p_reason is null
     or char_length(btrim(p_reason)) not between 5 and 1000
  then
    raise exception 'Void reason must contain between 5 and 1000 characters'
      using errcode = '22023';
  end if;

  if array_position(p_payment_ids, null) is not null then
    raise exception 'All selected payments must belong to the loan and be posted'
      using errcode = '22023';
  end if;

  select count(distinct selected.payment_id)::integer
    into v_distinct_count
  from unnest(p_payment_ids) as selected(payment_id);

  if v_distinct_count <> v_requested_count then
    raise exception 'Duplicate payment selection is not allowed'
      using errcode = '22023';
  end if;

  -- Lock every selected payment in deterministic UUID order before
  -- locking the related loan inside void_payment. This keeps
  -- overlapping bulk operations consistent and avoids partial writes.
  perform payment.id
  from public.payments as payment
  join unnest(p_payment_ids) as selected(payment_id)
    on selected.payment_id = payment.id
  order by payment.id
  for update of payment;

  select
    count(*)::integer,
    coalesce(sum(payment.amount), 0)::numeric(12,2)
  into
    v_locked_count,
    v_selected_amount
  from public.payments as payment
  where payment.id = any(p_payment_ids)
    and payment.loan_id = p_loan_id
    and payment.status = 'posted'::public.payment_status;

  if v_locked_count <> v_requested_count then
    raise exception 'All selected payments must belong to the loan and be posted'
      using errcode = '22023';
  end if;

  for v_payment_id in
    select selected.payment_id
    from unnest(p_payment_ids) as selected(payment_id)
    order by selected.payment_id
  loop
    select result.remaining_balance
      into v_remaining_balance
    from public.void_payment(v_payment_id, btrim(p_reason)) as result;
  end loop;

  return query
  select
    p_loan_id,
    v_requested_count,
    v_selected_amount,
    v_remaining_balance;
end;
$$;

revoke all on function public.void_payments_bulk(
  uuid,
  uuid[],
  text
) from public, anon;

grant execute on function public.void_payments_bulk(
  uuid,
  uuid[],
  text
) to authenticated;
