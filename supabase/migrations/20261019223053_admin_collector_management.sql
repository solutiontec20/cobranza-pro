-- ============================================================
-- COBRANZAPRO - ADMIN COLLECTOR MANAGEMENT
-- ============================================================

alter table public.profiles
  add column phone text;

alter table public.profiles
  add constraint profiles_phone_format_chk
  check (phone is null or phone ~ '^9[0-9]{8}$');

-- Serialize assignments with status changes so a customer cannot be assigned
-- between the active-customer check and a collector deactivation.
create or replace function private.validate_collector_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.collector_id::text, 0)
  );

  if not exists (
    select 1
    from public.profiles p
    where p.id = new.collector_id
      and p.role = 'collector'::public.app_role
      and p.active = true
  ) then
    raise exception
      'collector_id must reference an active collector';
  end if;

  return new;
end;
$$;


-- Profile creation is financially relevant identity data, so it must be
-- auditable in addition to the updates covered by the initial schema.
alter table private.audit_log
  drop constraint audit_log_action_chk;

alter table private.audit_log
  add constraint audit_log_action_chk
  check (action in ('INSERT', 'UPDATE'));

create or replace function private.audit_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_reason text;
begin
  audit_reason := nullif(
    current_setting('app.audit_reason', true),
    ''
  );

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
    (select auth.uid()),
    'INSERT',
    audit_reason,
    null,
    to_jsonb(new)
  );

  return new;
end;
$$;

create trigger profiles_audit_insert
after insert on public.profiles
for each row
execute function private.audit_insert();

create trigger profiles_audit_update
after update on public.profiles
for each row
execute function private.audit_update();


create or replace function public.admin_list_collectors()
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
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  if coalesce(
    (select private.current_app_role()) in (
      'admin'::public.app_role,
      'supervisor'::public.app_role
    ),
    false
  ) is false then
    raise exception using
      errcode = '42501',
      message = 'COLLECTOR_LIST_FORBIDDEN';
  end if;

  return query
  select
    p.id,
    p.dni,
    p.full_name,
    p.phone,
    p.active,
    p.created_at,
    count(c.id) filter (where c.active)::bigint as active_customer_count
  from public.profiles p
  left join public.customers c
    on c.collector_id = p.id
  where p.role = 'collector'::public.app_role
  group by p.id
  order by p.active desc, p.full_name asc;
end;
$$;


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
      active
    )
    values (
      p_user_id,
      p_dni,
      normalized_name,
      normalized_phone,
      'collector'::public.app_role,
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


create or replace function public.admin_set_collector_active(
  p_collector_id uuid,
  p_active boolean,
  p_reason text
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
  normalized_reason text := nullif(btrim(p_reason), '');
  assigned_customer_count bigint;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = '42501',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  if (select private.current_app_role()) is distinct from 'admin'::public.app_role then
    raise exception using
      errcode = '42501',
      message = 'COLLECTOR_STATUS_FORBIDDEN';
  end if;

  if p_active is null then
    raise exception using
      errcode = '22023',
      message = 'COLLECTOR_STATUS_REQUIRED';
  end if;

  if normalized_reason is null then
    raise exception using
      errcode = '22023',
      message = 'COLLECTOR_STATUS_REASON_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_collector_id
      and p.role = 'collector'::public.app_role
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'COLLECTOR_NOT_FOUND';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_collector_id::text, 0)
  );

  select count(*)
  into assigned_customer_count
  from public.customers c
  where c.collector_id = p_collector_id
    and c.active;

  if not p_active and assigned_customer_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COLLECTOR_HAS_ACTIVE_CUSTOMERS',
      detail = format(
        'The collector has %s active customer(s) assigned.',
        assigned_customer_count
      );
  end if;

  perform set_config('app.audit_reason', normalized_reason, true);

  update public.profiles p
  set active = p_active
  where p.id = p_collector_id
    and p.active is distinct from p_active;

  return query
  select
    p.id,
    p.dni,
    p.full_name,
    p.phone,
    p.active,
    p.created_at,
    assigned_customer_count
  from public.profiles p
  where p.id = p_collector_id;
end;
$$;


revoke execute
on function private.audit_insert()
from public, anon, authenticated;

revoke execute
on function public.admin_list_collectors()
from public, anon, authenticated;

revoke execute
on function public.admin_create_collector_profile(uuid, text, text, text)
from public, anon, authenticated;

revoke execute
on function public.admin_set_collector_active(uuid, boolean, text)
from public, anon, authenticated;

grant execute
on function public.admin_list_collectors()
to authenticated;

grant execute
on function public.admin_create_collector_profile(uuid, text, text, text)
to authenticated;

grant execute
on function public.admin_set_collector_active(uuid, boolean, text)
to authenticated;
