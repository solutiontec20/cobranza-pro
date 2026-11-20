-- ============================================================
-- COBRANZAPRO - CASH CLOSURE OPERATIONS
--
-- Confirmed business rules (user-provided specification):
--   - Opening float ("apertura"): cash handed to the collector at the
--     start of the day. Stays company money under the collector's
--     responsibility; it is neither income nor expense.
--   - Allowances ("viáticos"): cash handed for fuel, tolls, fares,
--     parking, authorized meals or other work expenses. Not an
--     expense by itself — only what is actually used AND approved
--     becomes an expense. Unused allowance naturally stays part of
--     the cash the collector must return (no special handling
--     needed: it was never subtracted).
--   - Collections are tracked by payment method (cash/yape/plin/
--     transfer). Only CASH collections are part of the physical
--     cash the collector must deliver; digital methods are part of
--     total collections but never touch the collector's cash.
--   - New loans disbursed in cash reduce the cash on hand (they are
--     not an expense: they create a receivable).
--   - Approved, cash-paid operating expenses reduce the cash on hand.
--     Rejected/void expenses must never reduce expected cash.
--   - Expected cash = opening + allowances + cash collections
--       - cash loan disbursements - approved cash operating expenses.
--   - The collector reports how much cash they actually deliver; the
--     system compares it against the expected amount (surplus/
--     shortfall), and any difference must carry an observation.
--   - A supervisor/admin validates the closure.
--   - All dates/times use America/Lima, matching the rest of the
--     schema (see `register_payment`, `submit_cash_closure`).
-- ============================================================


-- ============================================================
-- 1. NEW ENUMS
-- ============================================================

create type public.cash_expense_category as enum (
  'fuel',
  'tolls',
  'fares',
  'parking',
  'meals',
  'other'
);

create type public.cash_expense_status as enum (
  'pending',
  'approved',
  'rejected'
);


-- ============================================================
-- 2. CASH EXPENSES (viáticos utilizados / gastos operativos)
-- ============================================================
-- A request to spend part of an allowance. Only once approved does
-- it produce a `cash_movements` row (movement_type = 'operating_expense')
-- and therefore reduce expected cash. Rejected requests never touch
-- `cash_movements`, so they can never double-count or reduce cash.
-- ============================================================

create table public.cash_expenses (
  id uuid primary key default gen_random_uuid(),

  collector_id uuid not null
    references public.profiles(id)
    on delete restrict,

  business_date date not null,

  category public.cash_expense_category not null,

  amount numeric(12,2) not null
    constraint cash_expenses_amount_positive_chk
    check (amount > 0),

  description text,

  status public.cash_expense_status
    not null
    default 'pending',

  -- Set only when status = 'approved'; links to the cash outflow it produced.
  cash_movement_id uuid
    references public.cash_movements(id)
    on delete restrict,

  requested_by uuid not null
    references public.profiles(id)
    on delete restrict,

  reviewed_by uuid
    references public.profiles(id)
    on delete restrict,

  reviewed_at timestamptz,

  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cash_expenses_review_consistency_chk
  check (
    (
      status = 'pending'::public.cash_expense_status
      and reviewed_by is null
      and reviewed_at is null
      and cash_movement_id is null
      and rejection_reason is null
    )
    or (
      status = 'approved'::public.cash_expense_status
      and reviewed_by is not null
      and reviewed_at is not null
      and cash_movement_id is not null
      and rejection_reason is null
    )
    or (
      status = 'rejected'::public.cash_expense_status
      and reviewed_by is not null
      and reviewed_at is not null
      and cash_movement_id is null
      and nullif(btrim(rejection_reason), '') is not null
    )
  )
);

create index cash_expenses_collector_date_idx
  on public.cash_expenses (collector_id, business_date);

create index cash_expenses_status_idx
  on public.cash_expenses (status);

create unique index cash_expenses_cash_movement_unique_idx
  on public.cash_expenses (cash_movement_id)
  where cash_movement_id is not null;

create trigger cash_expenses_touch_updated_at
before update on public.cash_expenses
for each row
execute function private.touch_updated_at();


-- ============================================================
-- 3. ROW LEVEL SECURITY — CASH EXPENSES
-- ============================================================
-- Mirrors cash_movements_select / cash_closures_select exactly:
-- admin/supervisor see every row, a collector only sees their own.
-- All writes happen through SECURITY DEFINER RPCs below (no
-- insert/update grants to authenticated, same as cash_movements).
-- ============================================================

alter table public.cash_expenses
  enable row level security;

create policy cash_expenses_select
on public.cash_expenses
for select
to authenticated
using (
  (select private.current_app_role()) in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  )
  or (
    (select private.current_app_role()) = 'collector'::public.app_role
    and collector_id = (select auth.uid())
  )
);

revoke all
on table public.cash_expenses
from anon, authenticated;

grant select
on table public.cash_expenses
to authenticated;


-- ============================================================
-- 4. EXPECTED CASH CALCULATION (shared by submit/validate)
-- ============================================================
-- Only the movement types that represent physical cash in the
-- collector's hands contribute:
--   + opening_float, allowance              (always cash, by definition)
--   + collection                            (only when payment_method = 'cash')
--   - payment_void                          (only reversing a cash collection)
--   - loan_disbursement, operating_expense  (always cash, by definition)
-- Yape/Plin/transfer collections (and voids thereof) never touch this
-- total — they are tracked separately for the "total collected" view.
-- ============================================================

create or replace function private.collector_expected_cash(
  p_collector_id uuid,
  p_business_date date
)
returns numeric(12,2)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    sum(
      case
        when cm.movement_type in ('opening_float', 'allowance')
          and cm.direction = 'inflow'::public.cash_direction
        then cm.amount

        when cm.movement_type = 'collection'
          and cm.direction = 'inflow'::public.cash_direction
          and lower(btrim(coalesce(cm.payment_method, ''))) = 'cash'
        then cm.amount

        when cm.movement_type = 'payment_void'
          and cm.direction = 'outflow'::public.cash_direction
          and lower(btrim(coalesce(cm.payment_method, ''))) = 'cash'
        then -cm.amount

        when cm.movement_type in ('loan_disbursement', 'operating_expense')
          and cm.direction = 'outflow'::public.cash_direction
        then -cm.amount

        else 0
      end
    ),
    0
  )::numeric(12,2)
  from public.cash_movements cm
  where cm.collector_id = p_collector_id
    and cm.business_date = p_business_date;
$$;


-- ============================================================
-- 5. BREAKDOWN VIEW (for admin/collector screens)
-- ============================================================
-- security_invoker = true so it inherits cash_movements_select RLS:
-- admin/supervisor see every collector/day, a collector only their own.
-- Rows only exist for collector/day combinations that already have at
-- least one movement; the frontend fills zeros for days with none.
-- ============================================================

create view public.collector_cash_day_breakdown
with (security_invoker = true)
as
select
  cm.collector_id,
  cm.business_date,

  coalesce(sum(cm.amount) filter (
    where cm.movement_type = 'opening_float'
      and cm.direction = 'inflow'::public.cash_direction
  ), 0)::numeric(12,2) as opening_amount,

  coalesce(sum(cm.amount) filter (
    where cm.movement_type = 'allowance'
      and cm.direction = 'inflow'::public.cash_direction
  ), 0)::numeric(12,2) as allowance_amount,

  coalesce(sum(cm.amount) filter (
    where cm.movement_type = 'collection'
      and cm.direction = 'inflow'::public.cash_direction
      and lower(btrim(coalesce(cm.payment_method, ''))) = 'cash'
  ), 0)::numeric(12,2) as cash_collected_amount,

  coalesce(sum(cm.amount) filter (
    where cm.movement_type = 'collection'
      and cm.direction = 'inflow'::public.cash_direction
      and lower(btrim(coalesce(cm.payment_method, ''))) = 'yape'
  ), 0)::numeric(12,2) as yape_collected_amount,

  coalesce(sum(cm.amount) filter (
    where cm.movement_type = 'collection'
      and cm.direction = 'inflow'::public.cash_direction
      and lower(btrim(coalesce(cm.payment_method, ''))) = 'plin'
  ), 0)::numeric(12,2) as plin_collected_amount,

  coalesce(sum(cm.amount) filter (
    where cm.movement_type = 'collection'
      and cm.direction = 'inflow'::public.cash_direction
      and lower(btrim(coalesce(cm.payment_method, ''))) = 'transfer'
  ), 0)::numeric(12,2) as transfer_collected_amount,

  coalesce(sum(cm.amount) filter (
    where cm.movement_type = 'payment_void'
      and lower(btrim(coalesce(cm.payment_method, ''))) = 'cash'
  ), 0)::numeric(12,2) as voided_cash_amount,

  coalesce(sum(cm.amount) filter (
    where cm.movement_type = 'loan_disbursement'
      and cm.direction = 'outflow'::public.cash_direction
  ), 0)::numeric(12,2) as loan_disbursement_amount,

  coalesce(sum(cm.amount) filter (
    where cm.movement_type = 'operating_expense'
      and cm.direction = 'outflow'::public.cash_direction
  ), 0)::numeric(12,2) as operating_expense_amount

from public.cash_movements cm
group by cm.collector_id, cm.business_date;


-- ============================================================
-- 6. REGISTER CASH OPENING (apertura)
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

revoke execute
on function public.register_cash_opening(uuid, date, numeric, text)
from public, anon;

grant execute
on function public.register_cash_opening(uuid, date, numeric, text)
to authenticated;


-- ============================================================
-- 7. REGISTER CASH ALLOWANCE (viático entregado)
-- ============================================================

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

revoke execute
on function public.register_cash_allowance(uuid, date, numeric, text)
from public, anon;

grant execute
on function public.register_cash_allowance(uuid, date, numeric, text)
to authenticated;


-- ============================================================
-- 8. REQUEST CASH EXPENSE (gasto operativo, pendiente de aprobación)
-- ============================================================
-- A collector requests it for themself; an admin/supervisor may
-- request it on behalf of a specific collector. It never touches
-- cash_movements until reviewed and approved (see section 9).
-- ============================================================

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

revoke execute
on function public.request_cash_expense(date, public.cash_expense_category, numeric, text, uuid)
from public, anon;

grant execute
on function public.request_cash_expense(date, public.cash_expense_category, numeric, text, uuid)
to authenticated;


-- ============================================================
-- 9. REVIEW CASH EXPENSE (approve -> creates outflow / reject -> no cash effect)
-- ============================================================

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

revoke execute
on function public.review_cash_expense(uuid, boolean, text)
from public, anon;

grant execute
on function public.review_cash_expense(uuid, boolean, text)
to authenticated;


-- ============================================================
-- 10. SUBMIT / VALIDATE CASH CLOSURE — now using the real formula
-- ============================================================
-- Reassert both functions so they use `private.collector_expected_cash`
-- (opening + allowances + cash collections - cash disbursements -
-- approved cash expenses) instead of a naive sum of every movement,
-- and require an observation whenever delivered <> expected.
-- ============================================================

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
