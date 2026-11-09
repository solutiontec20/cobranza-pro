-- Generalize the self-service PIN completion step for every active application
-- profile. The shared `/cambiar-pin` route already applies to administrators,
-- supervisors, and collectors; only collector working hours remain role-specific
-- in the Edge Function.

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
    pin_locked_at = null
  where p.id = p_user_id;
end;
$$;

comment on function public.service_complete_pin_change(uuid) is
  'Completes a verified self-service PIN change for any active application profile.';

revoke execute
on function public.service_complete_pin_change(uuid)
from public, anon, authenticated;

grant execute
on function public.service_complete_pin_change(uuid)
to service_role;

-- Keep the old service-role entry point during rolling deployment so the
-- previously deployed Edge Function continues working for collectors until the
-- new function version is live.
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

revoke execute
on function public.service_complete_collector_pin_change(uuid)
from public, anon, authenticated;

grant execute
on function public.service_complete_collector_pin_change(uuid)
to service_role;
