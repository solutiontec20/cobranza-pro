-- Credential state stays outside auth.users so RLS can enforce it on every
-- financial request without exposing or duplicating the PIN itself.
alter table public.profiles
  add column must_change_pin boolean not null default false,
  add column pin_changed_at timestamptz,
  add column credentials_invalid_before timestamptz;

comment on column public.profiles.must_change_pin is
  'Blocks business access until the user replaces a temporary PIN.';

comment on column public.profiles.credentials_invalid_before is
  'Rejects JWTs issued before the latest credential reset or change.';


-- Service-role updates made by Edge Functions must still preserve the real
-- application actor in the existing audit trail.
create or replace function private.audit_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_reason text;
  configured_actor text;
  audit_actor uuid;
begin
  if to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  audit_reason := nullif(
    current_setting('app.audit_reason', true),
    ''
  );
  configured_actor := nullif(
    current_setting('app.audit_actor_id', true),
    ''
  );
  audit_actor := case
    when configured_actor is null then (select auth.uid())
    else configured_actor::uuid
  end;

  insert into private.audit_log (
    table_name,
    row_id,
    actor_user_id,
    action,
    reason,
    old_data,
    new_data
  )
  values (
    tg_table_name,
    new.id,
    audit_actor,
    'UPDATE',
    audit_reason,
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;


-- A user is operational only when the profile is active, the temporary PIN
-- was replaced and the JWT was issued after the last credential reset.
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active = true
    and p.must_change_pin = false
    and (
      p.credentials_invalid_before is null
      or to_timestamp((select auth.jwt() ->> 'iat')::double precision)
         >= p.credentials_invalid_before
    )
  limit 1;
$$;


create or replace function private.can_access_customer(
  p_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and (
        (select private.current_app_role()) in (
          'admin'::public.app_role,
          'supervisor'::public.app_role
        )
        or (
          (select private.current_app_role()) = 'collector'::public.app_role
          and c.collector_id = (select auth.uid())
        )
      )
  );
$$;


create or replace function private.can_access_loan(
  p_loan_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loans l
    join public.customers c on c.id = l.customer_id
    where l.id = p_loan_id
      and (
        (select private.current_app_role()) in (
          'admin'::public.app_role,
          'supervisor'::public.app_role
        )
        or (
          (select private.current_app_role()) = 'collector'::public.app_role
          and c.collector_id = (select auth.uid())
        )
      )
  );
$$;


create or replace function private.can_access_payment(
  p_payment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payments p
    join public.loans l on l.id = p.loan_id
    join public.customers c on c.id = l.customer_id
    where p.id = p_payment_id
      and (
        (select private.current_app_role()) in (
          'admin'::public.app_role,
          'supervisor'::public.app_role
        )
        or (
          (select private.current_app_role()) = 'collector'::public.app_role
          and c.collector_id = (select auth.uid())
        )
      )
  );
$$;


drop policy if exists customers_select on public.customers;
create policy customers_select
on public.customers
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

drop policy if exists customers_insert on public.customers;
create policy customers_insert
on public.customers
for insert
to authenticated
with check (
  (select private.current_app_role()) in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  )
  or (
    (select private.current_app_role()) = 'collector'::public.app_role
    and collector_id = (select auth.uid())
  )
);

drop policy if exists cash_movements_select on public.cash_movements;
create policy cash_movements_select
on public.cash_movements
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

drop policy if exists cash_closures_select on public.cash_closures;
create policy cash_closures_select
on public.cash_closures
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


-- New collectors always receive a temporary PIN and cannot operate until it
-- is changed. Existing users keep their current access during the rollout.
create or replace function public.admin_create_collector_profile(
  p_user_id uuid,
  p_dni text,
  p_full_name text,
  p_phone text default null
)
returns table (
  id uuid,
  dni text,
  full_name text,
  phone text,
  active boolean,
  created_at timestamptz,
  active_customer_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := nullif(btrim(p_full_name), '');
  normalized_phone text := nullif(btrim(p_phone), '');
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  if (select private.current_app_role()) is distinct from 'admin'::public.app_role then
    raise exception using
      errcode = '42501',
      message = 'COLLECTOR_CREATE_FORBIDDEN';
  end if;

  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'COLLECTOR_USER_ID_REQUIRED';
  end if;

  if p_dni is null or p_dni !~ '^[0-9]{8}$' then
    raise exception using
      errcode = '22023',
      message = 'COLLECTOR_DNI_INVALID';
  end if;

  if normalized_name is null then
    raise exception using
      errcode = '22023',
      message = 'COLLECTOR_NAME_REQUIRED';
  end if;

  if normalized_phone is not null and normalized_phone !~ '^9[0-9]{8}$' then
    raise exception using
      errcode = '22023',
      message = 'COLLECTOR_PHONE_INVALID';
  end if;

  perform set_config('app.audit_reason', 'collector profile created', true);

  return query
  with inserted as (
    insert into public.profiles (
      id,
      dni,
      full_name,
      phone,
      role,
      active,
      must_change_pin
    )
    values (
      p_user_id,
      p_dni,
      normalized_name,
      normalized_phone,
      'collector'::public.app_role,
      true,
      true
    )
    returning public.profiles.*
  )
  select
    i.id,
    i.dni,
    i.full_name,
    i.phone,
    i.active,
    i.created_at,
    0::bigint
  from inserted i;
end;
$$;


create or replace function public.admin_prepare_collector_pin_reset(
  p_collector_id uuid,
  p_reason text
)
returns table (
  id uuid,
  dni text,
  full_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_reason text := nullif(btrim(p_reason), '');
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  if (select private.current_app_role()) is distinct from 'admin'::public.app_role then
    raise exception using
      errcode = '42501',
      message = 'COLLECTOR_PIN_RESET_FORBIDDEN';
  end if;

  if normalized_reason is null or length(normalized_reason) < 5 then
    raise exception using
      errcode = '22023',
      message = 'COLLECTOR_PIN_RESET_REASON_INVALID';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_collector_id
      and p.role = 'collector'::public.app_role
      and p.active = true
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'ACTIVE_COLLECTOR_NOT_FOUND';
  end if;

  perform set_config('app.audit_reason', normalized_reason, true);

  return query
  update public.profiles p
  set
    must_change_pin = true,
    credentials_invalid_before = date_trunc('second', clock_timestamp())
  where p.id = p_collector_id
  returning p.id, p.dni, p.full_name;
end;
$$;


-- Only authenticated Edge Functions using the secret key may clear the forced
-- change state after Supabase Auth has accepted the new PIN.
create or replace function public.service_complete_collector_pin_change(
  p_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'USER_ID_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role = 'collector'::public.app_role
      and p.active = true
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'ACTIVE_COLLECTOR_NOT_FOUND';
  end if;

  perform set_config('app.audit_actor_id', p_user_id::text, true);
  perform set_config('app.audit_reason', 'collector PIN changed', true);

  update public.profiles p
  set
    must_change_pin = false,
    pin_changed_at = clock_timestamp(),
    credentials_invalid_before = date_trunc('second', clock_timestamp())
  where p.id = p_user_id;
end;
$$;


revoke execute
on function public.admin_prepare_collector_pin_reset(uuid, text)
from public, anon, authenticated;

grant execute
on function public.admin_prepare_collector_pin_reset(uuid, text)
to authenticated;

revoke execute
on function public.service_complete_collector_pin_change(uuid)
from public, anon, authenticated;

grant execute
on function public.service_complete_collector_pin_change(uuid)
to service_role;

