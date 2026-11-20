-- Collector-originated allowance (viaticum) requests.
--
-- An allowance is cash entrusted to a collector, so approval creates an
-- `allowance` inflow and increases expected cash. This is intentionally
-- separate from `cash_expenses`, whose approval creates an operating-expense
-- outflow and reduces expected cash.

create type public.cash_allowance_request_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table public.cash_allowance_requests (
  id uuid primary key default gen_random_uuid(),
  collector_id uuid not null
    references public.profiles(id)
    on delete restrict,
  business_date date not null,
  amount numeric(12,2) not null
    constraint cash_allowance_requests_amount_positive_chk
    check (amount > 0),
  notes text,
  status public.cash_allowance_request_status not null default 'pending',
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

  constraint cash_allowance_requests_requester_chk
    check (requested_by = collector_id),
  constraint cash_allowance_requests_review_consistency_chk
  check (
    (
      status = 'pending'::public.cash_allowance_request_status
      and reviewed_by is null
      and reviewed_at is null
      and cash_movement_id is null
      and rejection_reason is null
    )
    or (
      status = 'approved'::public.cash_allowance_request_status
      and reviewed_by is not null
      and reviewed_at is not null
      and cash_movement_id is not null
      and rejection_reason is null
    )
    or (
      status = 'rejected'::public.cash_allowance_request_status
      and reviewed_by is not null
      and reviewed_at is not null
      and cash_movement_id is null
      and nullif(btrim(rejection_reason), '') is not null
    )
  )
);

create index cash_allowance_requests_collector_date_idx
  on public.cash_allowance_requests (collector_id, business_date desc);

create index cash_allowance_requests_status_idx
  on public.cash_allowance_requests (status);

create unique index cash_allowance_requests_pending_unique_idx
  on public.cash_allowance_requests (collector_id, business_date)
  where status = 'pending'::public.cash_allowance_request_status;

create unique index cash_allowance_requests_movement_unique_idx
  on public.cash_allowance_requests (cash_movement_id)
  where cash_movement_id is not null;

create trigger cash_allowance_requests_touch_updated_at
before update on public.cash_allowance_requests
for each row
execute function private.touch_updated_at();

alter table public.cash_allowance_requests enable row level security;

create policy cash_allowance_requests_select
on public.cash_allowance_requests
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

revoke all on table public.cash_allowance_requests from anon, authenticated;
grant select on table public.cash_allowance_requests to authenticated;


create or replace function public.request_cash_allowance(
  p_business_date date,
  p_amount numeric,
  p_notes text default null
)
returns table (
  request_id uuid,
  collector_id uuid,
  business_date date,
  amount numeric(12,2),
  status public.cash_allowance_request_status,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_request_id uuid;
  v_created_at timestamptz;
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

  if v_role <> 'collector'::public.app_role then
    raise exception 'Only collectors may request an allowance'
      using errcode = '42501';
  end if;

  if p_business_date is null then
    raise exception 'Business date is required'
      using errcode = '22023';
  end if;

  if p_business_date <> (now() at time zone 'America/Lima')::date then
    raise exception 'Allowances may only be requested for the current business date'
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
  where cc.collector_id = v_actor
    and cc.business_date = p_business_date
  for update;

  if found and v_closure_status = 'validated'::public.cash_closure_status then
    raise exception 'Cannot request an allowance once the cash closure has been validated'
      using errcode = '22023';
  end if;

  insert into public.cash_allowance_requests (
    collector_id,
    business_date,
    amount,
    notes,
    requested_by
  )
  values (
    v_actor,
    p_business_date,
    p_amount::numeric(12,2),
    nullif(btrim(p_notes), ''),
    v_actor
  )
  returning cash_allowance_requests.id, cash_allowance_requests.created_at
  into v_request_id, v_created_at;

  return query
  select
    v_request_id,
    v_actor,
    p_business_date,
    p_amount::numeric(12,2),
    'pending'::public.cash_allowance_request_status,
    v_created_at;
exception
  when unique_violation then
    raise exception 'A pending allowance request already exists for this business date'
      using errcode = '23505';
end;
$$;

revoke execute
on function public.request_cash_allowance(date, numeric, text)
from public, anon;

grant execute
on function public.request_cash_allowance(date, numeric, text)
to authenticated;


create or replace function public.review_cash_allowance_request(
  p_request_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns table (
  request_id uuid,
  status public.cash_allowance_request_status,
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
  v_amount numeric(12,2);
  v_notes text;
  v_status public.cash_allowance_request_status;
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
    raise exception 'Only administrators or supervisors may review allowance requests'
      using errcode = '42501';
  end if;

  if p_approve is null then
    raise exception 'A review decision is required'
      using errcode = '22023';
  end if;

  select
    car.collector_id,
    car.business_date,
    car.amount,
    car.notes,
    car.status
  into
    v_collector_id,
    v_business_date,
    v_amount,
    v_notes,
    v_status
  from public.cash_allowance_requests car
  where car.id = p_request_id
  for update;

  if not found then
    raise exception 'Allowance request not found'
      using errcode = '22023';
  end if;

  if v_status <> 'pending'::public.cash_allowance_request_status then
    raise exception 'Only pending allowance requests may be reviewed'
      using errcode = '22023';
  end if;

  select cc.status into v_closure_status
  from public.cash_closures cc
  where cc.collector_id = v_collector_id
    and cc.business_date = v_business_date
  for update;

  if found and v_closure_status = 'validated'::public.cash_closure_status then
    raise exception 'Cannot review an allowance request once the cash closure has been validated'
      using errcode = '22023';
  end if;

  if p_approve then
    insert into public.cash_movements (
      collector_id,
      direction,
      movement_type,
      amount,
      occurred_at,
      business_date,
      notes,
      created_by
    )
    values (
      v_collector_id,
      'inflow'::public.cash_direction,
      'allowance',
      v_amount,
      now(),
      v_business_date,
      coalesce(v_notes, 'Viático aprobado'),
      v_actor
    )
    returning id into v_movement_id;

    update public.cash_allowance_requests
    set
      status = 'approved'::public.cash_allowance_request_status,
      reviewed_by = v_actor,
      reviewed_at = now(),
      cash_movement_id = v_movement_id
    where id = p_request_id;
  else
    if nullif(btrim(p_reason), '') is null then
      raise exception 'A rejection reason is required'
        using errcode = '22023';
    end if;

    update public.cash_allowance_requests
    set
      status = 'rejected'::public.cash_allowance_request_status,
      reviewed_by = v_actor,
      reviewed_at = now(),
      rejection_reason = btrim(p_reason)
    where id = p_request_id;
  end if;

  return query
  select
    car.id,
    car.status,
    car.cash_movement_id,
    private.collector_expected_cash(v_collector_id, v_business_date)
  from public.cash_allowance_requests car
  where car.id = p_request_id;
end;
$$;

revoke execute
on function public.review_cash_allowance_request(uuid, boolean, text)
from public, anon;

grant execute
on function public.review_cash_allowance_request(uuid, boolean, text)
to authenticated;

-- Direct allowance registration is retired: all new allowances must originate
-- from a collector request and be approved through the review RPC above.
revoke execute
on function public.register_cash_allowance(uuid, date, numeric, text)
from public, anon, authenticated;

comment on table public.cash_allowance_requests is
  'Auditable collector-originated viaticum requests; approval creates one linked allowance cash movement.';
