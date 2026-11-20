-- Replace the permanent PIN lock with a temporary, progressively longer
-- authentication cooldown. A login cooldown must not revoke an already-valid
-- session's RLS/RPC access: otherwise five anonymous requests can interrupt a
-- collector who is actively working.

alter table public.profiles
  add column pin_locked_until timestamptz;

comment on column public.profiles.pin_locked_at is
  'Timestamp of the most recent PIN cooldown start. It is audit metadata and does not revoke an existing authenticated session.';

comment on column public.profiles.pin_locked_until is
  'End of the temporary PIN authentication cooldown. New credential checks are paused until this instant; existing sessions remain authorized.';

-- Convert any legacy permanent lock into a bounded cooldown from deployment.
update public.profiles
set pin_locked_until = clock_timestamp() + interval '15 minutes'
where pin_locked_at is not null;


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
    and (
      p.role <> 'collector'::public.app_role
      or private.collector_access_is_open(
        private.current_business_timestamp()
      )
    )
  limit 1;
$$;


create or replace function public.current_access_status()
returns table (
  allowed boolean,
  role public.app_role,
  server_now timestamptz,
  opens_at timestamptz,
  closes_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_now timestamptz := private.current_business_timestamp();
  v_business_date date;
begin
  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select p.*
    into v_profile
  from public.profiles p
  where p.id = v_actor;

  if not found then
    raise exception 'Application profile required'
      using errcode = '42501';
  end if;

  v_business_date := (v_now at time zone 'America/Lima')::date;

  allowed := v_profile.active
    and (
      v_profile.credentials_invalid_before is null
      or to_timestamp((select auth.jwt() ->> 'iat')::double precision)
         >= v_profile.credentials_invalid_before
    )
    and (
      v_profile.role <> 'collector'::public.app_role
      or private.collector_access_is_open(v_now)
    );
  role := v_profile.role;
  server_now := v_now;
  opens_at := (v_business_date + time '07:00:00') at time zone 'America/Lima';
  closes_at := (v_business_date + time '20:00:00') at time zone 'America/Lima';

  return next;
end;
$$;


create or replace function public.service_record_login_attempt(
  p_profile_id uuid,
  p_success boolean
)
returns table (
  locked boolean,
  failed_attempts smallint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_threshold constant smallint := 5;
  v_now timestamptz := clock_timestamp();
  v_failed_attempts smallint;
  v_locked_until timestamptz;
begin
  if p_profile_id is null then
    raise exception using
      errcode = '22023',
      message = 'PROFILE_ID_REQUIRED';
  end if;

  perform set_config('app.audit_actor_id', p_profile_id::text, true);

  if p_success then
    perform set_config('app.audit_reason', 'successful PIN verification', true);

    update public.profiles p
    set
      failed_pin_attempts = 0,
      pin_locked_at = null,
      pin_locked_until = null
    where p.id = p_profile_id;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'PROFILE_NOT_FOUND';
    end if;

    return query
    select false, 0::smallint;
    return;
  end if;

  perform set_config('app.audit_reason', 'failed PIN verification', true);

  update public.profiles p
  set
    failed_pin_attempts = least(
      p.failed_pin_attempts::integer + 1,
      32767
    )::smallint,
    pin_locked_at = case
      when p.failed_pin_attempts::integer + 1 >= v_threshold then v_now
      else null
    end,
    pin_locked_until = case
      when p.failed_pin_attempts::integer + 1 < v_threshold then null
      else v_now + make_interval(
        mins => case
          when p.failed_pin_attempts::integer + 1 = 5 then 15
          when p.failed_pin_attempts::integer + 1 = 6 then 30
          when p.failed_pin_attempts::integer + 1 = 7 then 60
          when p.failed_pin_attempts::integer + 1 = 8 then 120
          when p.failed_pin_attempts::integer + 1 = 9 then 240
          else 480
        end
      )
    end
  where p.id = p_profile_id
  returning p.failed_pin_attempts, p.pin_locked_until
  into v_failed_attempts, v_locked_until;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PROFILE_NOT_FOUND';
  end if;

  return query
  select (v_locked_until > v_now), v_failed_attempts;
end;
$$;

revoke execute
on function public.service_record_login_attempt(uuid, boolean)
from public, anon, authenticated;

grant execute
on function public.service_record_login_attempt(uuid, boolean)
to service_role;


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
    credentials_invalid_before = date_trunc('second', clock_timestamp()),
    failed_pin_attempts = 0,
    pin_locked_at = null,
    pin_locked_until = null
  where p.id = p_collector_id
  returning p.id, p.dni, p.full_name;
end;
$$;


create or replace function public.service_complete_pin_change(
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
      and p.active = true
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'ACTIVE_PROFILE_NOT_FOUND';
  end if;

  perform set_config('app.audit_actor_id', p_user_id::text, true);
  perform set_config('app.audit_reason', 'PIN changed', true);

  update public.profiles p
  set
    must_change_pin = false,
    pin_changed_at = clock_timestamp(),
    credentials_invalid_before = date_trunc('second', clock_timestamp()),
    failed_pin_attempts = 0,
    pin_locked_at = null,
    pin_locked_until = null
  where p.id = p_user_id;
end;
$$;

revoke execute
on function public.service_complete_pin_change(uuid)
from public, anon, authenticated;

grant execute
on function public.service_complete_pin_change(uuid)
to service_role;


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
    credentials_invalid_before = date_trunc('second', clock_timestamp()),
    failed_pin_attempts = 0,
    pin_locked_at = null,
    pin_locked_until = null
  where p.id = p_user_id;
end;
$$;

revoke execute
on function public.service_complete_collector_pin_change(uuid)
from public, anon, authenticated;

grant execute
on function public.service_complete_collector_pin_change(uuid)
to service_role;
