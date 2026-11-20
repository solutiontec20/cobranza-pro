-- ============================================================
-- COBRANZAPRO - CASH CLOSURE: OPERATIONAL PROFILE GUARD
--
-- Bug found: every cash-closure RPC resolved the caller's role via
-- `private.current_app_role()` and then compared it directly
-- (`v_role <> 'collector'`, `v_role not in (...)`), without first
-- checking whether the role actually resolved at all.
--
-- `current_app_role()` returns NULL — not an error — whenever the
-- profile is inactive, still has `must_change_pin = true` (e.g. right
-- after an admin resets a collector's PIN), or the session JWT was
-- issued before `credentials_invalid_before` (a stale/old session
-- after a credential reset). See
-- `supabase/migrations/20261020165847_secure_collector_pin_management.sql`.
--
-- In SQL's three-valued logic, `NULL <> 'collector'` and
-- `NULL NOT IN (...)` both evaluate to NULL, and `IF NULL THEN ... END
-- IF` in PL/pgSQL never executes — so for `submit_cash_closure`,
-- `register_cash_opening`, `register_cash_allowance` and
-- `review_cash_expense` a NULL role **silently bypassed the
-- authorization check** (a real, if narrow, security hole). For
-- `request_cash_expense` the `if/elsif/else` shape happened to catch
-- it in the `else` branch, but raised the generic `'Insufficient
-- privileges'` message — which the frontend adapter has no specific
-- translation for, so it fell back to the generic "No tenés permisos
-- para realizar esta acción.", exactly the confusing message a
-- collector whose profile isn't fully operational yet would see when
-- trying to request an expense or submit their cash closure.
--
-- Fix: add the same explicit, NULL-safe guard already used by
-- `register_payment` (`supabase/migrations/20261019181116_financial_rpcs.sql`)
-- right after resolving the role in every cash-closure RPC, with one
-- clear, consistent message the frontend can translate specifically.
-- ============================================================

create or replace function public.register_cash_opening(
  p_collector_id uuid,
  p_business_date date,
  p_amount numeric,
  p_notes text default null
)
returns table (
  cash_movement_id uuid,
  collector_id uuid,
  business_date date,
  amount numeric(12,2),
  expected_cash numeric(12,2)
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_movement_id uuid;
  v_closure_status public.cash_closure_status;
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
    raise exception 'Only administrators or supervisors may register an opening float'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_collector_id
      and p.role = 'collector'::public.app_role
      and p.active = true
  ) then
    raise exception 'Opening float must be registered for an active collector'
      using errcode = '22023';
  end if;

  if p_business_date is null then
    raise exception 'Business date is required'
      using errcode = '22023';
  end if;

  if p_business_date > (now() at time zone 'America/Lima')::date then
    raise exception 'Future opening floats are not allowed'
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Opening float amount must be greater than zero'
      using errcode = '22023';
  end if;

  if p_amount <> round(p_amount, 2) then
    raise exception 'Opening float amount may contain at most two decimals'
      using errcode = '22023';
  end if;

  select cc.status into v_closure_status
  from public.cash_closures cc
  where cc.collector_id = p_collector_id
    and cc.business_date = p_business_date
  for update;

  if found and v_closure_status = 'validated'::public.cash_closure_status then
    raise exception 'Cannot register cash movements once the cash closure has been validated'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.cash_movements cm
    where cm.collector_id = p_collector_id
      and cm.business_date = p_business_date
      and cm.movement_type = 'opening_float'
  ) then
    raise exception 'Opening float has already been registered for this collector and date'
      using errcode = '23505';
  end if;

  insert into public.cash_movements (
    collector_id, direction, movement_type, amount,
    occurred_at, business_date, notes, created_by
  )
  values (
    p_collector_id, 'inflow'::public.cash_direction, 'opening_float',
    p_amount::numeric(12,2), now(), p_business_date,
    nullif(btrim(p_notes), ''), v_actor
  )
  returning id into v_movement_id;

  return query
  select
    v_movement_id,
    p_collector_id,
    p_business_date,
    p_amount::numeric(12,2),
    private.collector_expected_cash(p_collector_id, p_business_date);
end;
$$;


create or replace function public.register_cash_allowance(
  p_collector_id uuid,
  p_business_date date,
  p_amount numeric,
  p_notes text default null
)
returns table (
  cash_movement_id uuid,
  collector_id uuid,
  business_date date,
  amount numeric(12,2),
  expected_cash numeric(12,2)
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_movement_id uuid;
  v_closure_status public.cash_closure_status;
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
    raise exception 'Only administrators or supervisors may register an allowance'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_collector_id
      and p.role = 'collector'::public.app_role
      and p.active = true
  ) then
    raise exception 'Allowance must be registered for an active collector'
      using errcode = '22023';
  end if;

  if p_business_date is null then
    raise exception 'Business date is required'
      using errcode = '22023';
  end if;

  if p_business_date > (now() at time zone 'America/Lima')::date then
    raise exception 'Future allowances are not allowed'
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Allowance amount must be greater than zero'
      using errcode = '22023';
  end if;

  if p_amount <> round(p_amount, 2) then
    raise exception 'Allowance amount may contain at most two decimals'
      using errcode = '22023';
  end if;

  select cc.status into v_closure_status
  from public.cash_closures cc
  where cc.collector_id = p_collector_id
    and cc.business_date = p_business_date
  for update;

  if found and v_closure_status = 'validated'::public.cash_closure_status then
    raise exception 'Cannot register cash movements once the cash closure has been validated'
      using errcode = '22023';
  end if;

  insert into public.cash_movements (
    collector_id, direction, movement_type, amount,
    occurred_at, business_date, notes, created_by
  )
  values (
    p_collector_id, 'inflow'::public.cash_direction, 'allowance',
    p_amount::numeric(12,2), now(), p_business_date,
    nullif(btrim(p_notes), ''), v_actor
  )
  returning id into v_movement_id;

  return query
  select
    v_movement_id,
    p_collector_id,
    p_business_date,
    p_amount::numeric(12,2),
    private.collector_expected_cash(p_collector_id, p_business_date);
end;
$$;


create or replace function public.request_cash_expense(
  p_business_date date,
  p_category public.cash_expense_category,
  p_amount numeric,
  p_description text default null,
  p_collector_id uuid default null
)
returns table (
  expense_id uuid,
  collector_id uuid,
  business_date date,
  category public.cash_expense_category,
  amount numeric(12,2),
  status public.cash_expense_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_collector_id uuid;
  v_expense_id uuid;
  v_closure_status public.cash_closure_status;
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

  if v_role = 'collector'::public.app_role then
    if p_collector_id is not null and p_collector_id <> v_actor then
      raise exception 'Collector cannot request an expense for another portfolio'
        using errcode = '42501';
    end if;
    v_collector_id := v_actor;
  elsif v_role in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    if p_collector_id is null then
      raise exception 'Collector is required when an administrator requests an expense'
        using errcode = '22023';
    end if;
    v_collector_id := p_collector_id;
  else
    raise exception 'Insufficient privileges'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_collector_id
      and p.role = 'collector'::public.app_role
      and p.active = true
  ) then
    raise exception 'Expense must be requested for an active collector'
      using errcode = '22023';
  end if;

  if p_business_date is null then
    raise exception 'Business date is required'
      using errcode = '22023';
  end if;

  if p_business_date > (now() at time zone 'America/Lima')::date then
    raise exception 'Future expenses are not allowed'
      using errcode = '22023';
  end if;

  if p_category is null then
    raise exception 'Expense category is required'
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Expense amount must be greater than zero'
      using errcode = '22023';
  end if;

  if p_amount <> round(p_amount, 2) then
    raise exception 'Expense amount may contain at most two decimals'
      using errcode = '22023';
  end if;

  select cc.status into v_closure_status
  from public.cash_closures cc
  where cc.collector_id = v_collector_id
    and cc.business_date = p_business_date
  for update;

  if found and v_closure_status = 'validated'::public.cash_closure_status then
    raise exception 'Cannot request an expense once the cash closure has been validated'
      using errcode = '22023';
  end if;

  insert into public.cash_expenses (
    collector_id, business_date, category, amount, description,
    status, requested_by
  )
  values (
    v_collector_id, p_business_date, p_category, p_amount::numeric(12,2),
    nullif(btrim(p_description), ''), 'pending'::public.cash_expense_status, v_actor
  )
  returning id into v_expense_id;

  return query
  select ce.id, ce.collector_id, ce.business_date, ce.category, ce.amount, ce.status
  from public.cash_expenses ce
  where ce.id = v_expense_id;
end;
$$;


create or replace function public.review_cash_expense(
  p_expense_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns table (
  expense_id uuid,
  status public.cash_expense_status,
  cash_movement_id uuid,
  expected_cash numeric(12,2)
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;

  v_collector_id uuid;
  v_business_date date;
  v_category public.cash_expense_category;
  v_amount numeric(12,2);
  v_description text;
  v_status public.cash_expense_status;

  v_closure_status public.cash_closure_status;
  v_movement_id uuid;
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
    raise exception 'Only administrators or supervisors may review expenses'
      using errcode = '42501';
  end if;

  if p_approve is null then
    raise exception 'A review decision is required'
      using errcode = '22023';
  end if;

  select
    ce.collector_id, ce.business_date, ce.category, ce.amount, ce.description, ce.status
  into
    v_collector_id, v_business_date, v_category, v_amount, v_description, v_status
  from public.cash_expenses ce
  where ce.id = p_expense_id
  for update;

  if not found then
    raise exception 'Expense not found'
      using errcode = '22023';
  end if;

  if v_status <> 'pending'::public.cash_expense_status then
    raise exception 'Only pending expenses may be reviewed'
      using errcode = '22023';
  end if;

  select cc.status into v_closure_status
  from public.cash_closures cc
  where cc.collector_id = v_collector_id
    and cc.business_date = v_business_date
  for update;

  if found and v_closure_status = 'validated'::public.cash_closure_status then
    raise exception 'Cannot review an expense once the cash closure has been validated'
      using errcode = '22023';
  end if;

  if p_approve then

    insert into public.cash_movements (
      collector_id, direction, movement_type, amount, payment_method,
      occurred_at, business_date, notes, created_by
    )
    values (
      v_collector_id, 'outflow'::public.cash_direction, 'operating_expense',
      v_amount, 'cash', now(), v_business_date,
      coalesce(v_description, v_category::text), v_actor
    )
    returning id into v_movement_id;

    update public.cash_expenses
    set
      status = 'approved'::public.cash_expense_status,
      reviewed_by = v_actor,
      reviewed_at = now(),
      cash_movement_id = v_movement_id
    where id = p_expense_id;

  else

    if nullif(btrim(p_reason), '') is null then
      raise exception 'A rejection reason is required'
        using errcode = '22023';
    end if;

    update public.cash_expenses
    set
      status = 'rejected'::public.cash_expense_status,
      reviewed_by = v_actor,
      reviewed_at = now(),
      rejection_reason = btrim(p_reason)
    where id = p_expense_id;

  end if;

  return query
  select
    ce.id,
    ce.status,
    ce.cash_movement_id,
    private.collector_expected_cash(v_collector_id, v_business_date)
  from public.cash_expenses ce
  where ce.id = p_expense_id;
end;
$$;


create or replace function public.submit_cash_closure(
  p_business_date date,
  p_delivered_amount numeric,
  p_observation text default null
)
returns table (
  closure_id uuid,
  expected_amount numeric(12,2),
  delivered_amount numeric(12,2),
  difference_amount numeric(12,2),
  closure_status public.cash_closure_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role public.app_role;

  v_closure_id uuid;
  v_existing_status public.cash_closure_status;
  v_exists boolean;

  v_expected numeric(12,2);
  v_observation text;
begin

  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select private.current_app_role()
    into v_role;

  if v_role is null then
    raise exception 'Active application profile required'
      using errcode = '42501';
  end if;

  if v_role <> 'collector'::public.app_role then
    raise exception 'Only collectors may submit their cash closure'
      using errcode = '42501';
  end if;

  if p_business_date is null then
    raise exception 'Business date is required'
      using errcode = '22023';
  end if;

  if p_business_date >
     (now() at time zone 'America/Lima')::date
  then
    raise exception 'Future cash closures are not allowed'
      using errcode = '22023';
  end if;

  if p_delivered_amount is null
     or p_delivered_amount < 0
  then
    raise exception 'Delivered amount cannot be negative'
      using errcode = '22023';
  end if;

  if p_delivered_amount <> round(p_delivered_amount, 2) then
    raise exception 'Delivered amount may contain at most two decimals'
      using errcode = '22023';
  end if;

  -- Lock existing closure if present
  select cc.id, cc.status
    into v_closure_id, v_existing_status
  from public.cash_closures cc
  where cc.collector_id = v_actor
    and cc.business_date = p_business_date
  for update;

  v_exists := found;

  if v_exists
     and v_existing_status = 'validated'::public.cash_closure_status
  then
    raise exception 'Validated cash closure cannot be resubmitted'
      using errcode = '22023';
  end if;

  v_expected := private.collector_expected_cash(v_actor, p_business_date);
  v_observation := nullif(btrim(p_observation), '');

  if p_delivered_amount <> v_expected and v_observation is null then
    raise exception 'An observation is required when the delivered amount differs from the expected amount'
      using errcode = '22023';
  end if;

  -- Insert or update closure
  if v_exists then
    perform set_config('app.audit_reason', 'Cash closure resubmitted', true);

    update public.cash_closures
    set
      expected_amount = v_expected,
      delivered_amount = p_delivered_amount::numeric(12,2),
      status = 'submitted'::public.cash_closure_status,
      observation = v_observation,
      submitted_at = now()
    where id = v_closure_id;
  else
    insert into public.cash_closures (
      collector_id, business_date, expected_amount, delivered_amount,
      status, observation, submitted_at, created_by
    )
    values (
      v_actor, p_business_date, v_expected, p_delivered_amount::numeric(12,2),
      'submitted'::public.cash_closure_status,
      v_observation, now(), v_actor
    )
    returning id into v_closure_id;
  end if;

  return query
  select cc.id, cc.expected_amount, cc.delivered_amount, cc.difference_amount, cc.status
  from public.cash_closures cc
  where cc.id = v_closure_id;

end;
$$;


create or replace function public.validate_cash_closure(
  p_closure_id uuid,
  p_observation text default null
)
returns table (
  closure_id uuid,
  expected_amount numeric(12,2),
  delivered_amount numeric(12,2),
  difference_amount numeric(12,2),
  closure_status public.cash_closure_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role public.app_role;
  v_collector_id uuid;
  v_business_date date;
  v_status public.cash_closure_status;
  v_delivered numeric(12,2);
  v_expected numeric(12,2);
  v_observation text;
begin

  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select private.current_app_role() into v_role;

  if v_role is null then
    raise exception 'Active application profile required'
      using errcode = '42501';
  end if;

  if v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception 'Only administrators or supervisors may validate cash closures'
      using errcode = '42501';
  end if;

  -- Lock closure
  select cc.collector_id, cc.business_date, cc.status, cc.delivered_amount, cc.observation
    into v_collector_id, v_business_date, v_status, v_delivered, v_observation
  from public.cash_closures cc
  where cc.id = p_closure_id
  for update;

  if not found then
    raise exception 'Cash closure not found' using errcode = '22023';
  end if;

  if v_status <> 'submitted'::public.cash_closure_status then
    raise exception 'Only submitted cash closures may be validated'
      using errcode = '22023';
  end if;

  -- Recalculate expected amount at validation time.
  v_expected := private.collector_expected_cash(v_collector_id, v_business_date);
  v_observation := coalesce(nullif(btrim(p_observation), ''), v_observation);

  if v_delivered <> v_expected and v_observation is null then
    raise exception 'An observation is required when the delivered amount differs from the expected amount'
      using errcode = '22023';
  end if;

  perform set_config('app.audit_reason', 'Cash closure validated', true);

  update public.cash_closures
  set
    expected_amount = v_expected,
    status = 'validated'::public.cash_closure_status,
    validated_at = now(),
    validated_by = v_actor,
    observation = v_observation
  where id = p_closure_id;

  return query
  select cc.id, cc.expected_amount, cc.delivered_amount, cc.difference_amount, cc.status
  from public.cash_closures cc
  where cc.id = p_closure_id;

end;
$$;
