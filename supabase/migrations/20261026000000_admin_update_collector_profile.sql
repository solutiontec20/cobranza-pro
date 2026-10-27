-- ============================================================
-- COBRANZAPRO - ADMIN UPDATE COLLECTOR PROFILE
--
-- The collectors admin screen could only deactivate/activate a
-- collector and reset their PIN; there was no way to correct a
-- collector's full name or phone number after creation. DNI is
-- intentionally NOT editable here: it doubles as the collector's
-- login identifier (the synthesized auth email is
-- `${dni}@auth.cobranzapro.local`), so changing it would also
-- require resynchronizing Supabase Auth via a service-role Edge
-- Function — out of scope for this change.
-- ============================================================

create or replace function public.admin_update_collector_profile(
  p_collector_id uuid,
  p_full_name text,
  p_reason text,
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
      message = 'COLLECTOR_UPDATE_FORBIDDEN';
  end if;

  if normalized_reason is null then
    raise exception using
      errcode = '22023',
      message = 'COLLECTOR_UPDATE_REASON_REQUIRED';
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

  perform set_config('app.audit_reason', normalized_reason, true);

  update public.profiles p
  set
    full_name = normalized_name,
    phone = normalized_phone
  where p.id = p_collector_id;

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
  where p.id = p_collector_id
  group by p.id;
end;
$$;


revoke execute
on function public.admin_update_collector_profile(uuid, text, text, text)
from public, anon, authenticated;

grant execute
on function public.admin_update_collector_profile(uuid, text, text, text)
to authenticated;
