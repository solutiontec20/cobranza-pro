-- ============================================================
-- LOGIN ATTEMPT LOCKOUT
-- ============================================================
-- REQUERIMIENTO.md sections 2 and 13: "Si alguien se equivoca
-- varias veces seguidas, el sistema lo bloquea por seguridad, y
-- el administrador puede darle una clave nueva."
--
-- The PIN is only 6 numeric digits (1,000,000 combinations) and
-- the only existing protection is Supabase Auth's IP-based rate
-- limit (not per-account, trivially bypassed by distributing the
-- attack across IPs). This migration adds a real per-account
-- lockout counted by the `login` Edge Function (which wraps the
-- actual GoTrue signInWithPassword call) and enforced at the
-- database layer via `private.current_app_role()`, the same
-- function that already gates every RLS policy and every
-- financial RPC in this schema for `must_change_pin` and
-- `credentials_invalid_before`.
--
-- Threshold: 5 consecutive failed attempts locks the account.
-- Unlock only happens the same way `must_change_pin` already
-- works: an administrator issues a new PIN
-- (admin_prepare_collector_pin_reset), which also clears the
-- lock -- "el administrador puede darle una clave nueva" is
-- exactly the unlock mechanism this migration wires up.
-- ============================================================

alter table public.profiles
  add column failed_pin_attempts smallint not null default 0,
  add column pin_locked_at timestamptz;

comment on column public.profiles.failed_pin_attempts is
  'Consecutive failed PIN attempts since the last successful login or PIN reset. Reset to 0 on success or admin PIN reset.';

comment on column public.profiles.pin_locked_at is
  'Set once failed_pin_attempts reaches the lockout threshold. Blocks all RLS/RPC access via current_app_role() until an administrator issues a new PIN.';


-- A locked account must lose all business access immediately,
-- exactly like an inactive account or a forced PIN change.
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
  limit 1;
$$;


-- Called exclusively by the `login` Edge Function (via the
-- service-role/admin client) after it attempts the real
-- GoTrue signInWithPassword call. This function never runs
-- inside a user session -- at the point it is called the caller
-- has not been authorized as anyone yet, so it cannot be a
-- SECURITY DEFINER callable by `authenticated`/`anon`: it is
-- restricted to `service_role` only, same as
-- service_complete_collector_pin_change.
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
  v_failed_attempts smallint;
  v_locked_at timestamptz;
begin
  if p_profile_id is null then
    raise exception using
      errcode = '22023',
      message = 'PROFILE_ID_REQUIRED';
  end if;

  if p_success then
    perform set_config('app.audit_actor_id', p_profile_id::text, true);
    perform set_config('app.audit_reason', 'successful login', true);

    update public.profiles p
    set failed_pin_attempts = 0
    where p.id = p_profile_id
      and p.failed_pin_attempts <> 0;

    return query
    select false, 0::smallint;
    return;
  end if;

  perform set_config('app.audit_actor_id', p_profile_id::text, true);
  perform set_config('app.audit_reason', 'failed login attempt', true);

  update public.profiles p
  set
    failed_pin_attempts = p.failed_pin_attempts + 1,
    pin_locked_at = case
      when p.failed_pin_attempts + 1 >= v_threshold and p.pin_locked_at is null
        then clock_timestamp()
      else p.pin_locked_at
    end
  where p.id = p_profile_id
  returning p.failed_pin_attempts, p.pin_locked_at
  into v_failed_attempts, v_locked_at;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PROFILE_NOT_FOUND';
  end if;

  return query
  select (v_locked_at is not null), v_failed_attempts;
end;
$$;

revoke execute
on function public.service_record_login_attempt(uuid, boolean)
from public, anon, authenticated;

grant execute
on function public.service_record_login_attempt(uuid, boolean)
to service_role;


-- Giving a collector a new PIN is the documented unlock path:
-- also clear the lockout counters so the new PIN works right away.
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
    pin_locked_at = null
  where p.id = p_collector_id
  returning p.id, p.dni, p.full_name;
end;
$$;


-- Defensive: a collector finishing a normal PIN change (not an
-- admin reset) should also start with a clean lockout counter.
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
    pin_locked_at = null
  where p.id = p_user_id;
end;
$$;
