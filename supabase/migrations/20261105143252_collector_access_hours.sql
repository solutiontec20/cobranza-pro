-- Enforce the collector access window at the database authorization boundary.
-- Collectors may operate from 07:00:00 (inclusive) until 20:00:00 (exclusive)
-- in America/Lima. Administrators and supervisors remain unrestricted by time.

create or replace function private.current_business_timestamp()
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_test_timestamp text;
begin
  -- pgTAP connects as postgres and needs a deterministic clock so the suite
  -- does not start failing merely because CI runs outside business hours.
  -- PostgREST requests use a different session_user, so authenticated clients
  -- cannot influence the production clock by setting this custom GUC.
  if session_user = 'postgres' then
    v_test_timestamp := current_setting('app.test_business_timestamp', true);

    if v_test_timestamp is not null and btrim(v_test_timestamp) <> '' then
      return v_test_timestamp::timestamptz;
    end if;
  end if;

  return statement_timestamp();
end;
$$;


create or replace function private.collector_access_is_open(
  p_at timestamptz
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select (p_at at time zone 'America/Lima')::time >= time '07:00:00'
     and (p_at at time zone 'America/Lima')::time < time '20:00:00';
$$;


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
    and p.pin_locked_at is null
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
    and v_profile.pin_locked_at is null
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


revoke execute
on function private.current_business_timestamp()
from public, anon, authenticated;

revoke execute
on function private.collector_access_is_open(timestamptz)
from public, anon, authenticated;

revoke all
on function public.current_access_status()
from public, anon, authenticated;

grant execute
on function public.current_access_status()
to authenticated;
