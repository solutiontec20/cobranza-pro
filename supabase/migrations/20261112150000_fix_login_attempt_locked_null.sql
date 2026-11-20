-- Fix: service_record_login_attempt returned `locked = NULL` for failed attempts
-- below the cooldown threshold (1-4), because `pin_locked_until` is NULL there
-- and `NULL > now` evaluates to NULL. The contract is a boolean: below the
-- threshold the account is not locked, so return `false`.
--
-- Behavior is otherwise identical to 20261112143117_temporize_pin_lockout.sql.

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
  select coalesce(v_locked_until > v_now, false), v_failed_attempts;
end;
$$;

revoke execute
on function public.service_record_login_attempt(uuid, boolean)
from public, anon, authenticated;

grant execute
on function public.service_record_login_attempt(uuid, boolean)
to service_role;
