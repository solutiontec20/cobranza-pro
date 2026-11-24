-- Keep the shared collector schedule database-authoritative and fail closed.

create table private.collector_access_schedule (
  singleton boolean primary key default true check (singleton),
  start_time time not null default time '07:00:00',
  end_time time not null default time '20:00:00',
  timezone text not null default 'America/Lima',
  constraint collector_access_schedule_order check (start_time < end_time),
  constraint collector_access_schedule_timezone check (timezone = 'America/Lima')
);

alter table private.collector_access_schedule enable row level security;
revoke all on private.collector_access_schedule from public, anon, authenticated;

insert into private.collector_access_schedule(singleton, start_time, end_time, timezone)
values (true, time '07:00:00', time '20:00:00', 'America/Lima');

create or replace function private.collector_access_is_open(p_at timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_schedule private.collector_access_schedule%rowtype;
  v_row_count bigint;
  v_local_time time;
begin
  if p_at is null then
    return false;
  end if;

  select count(*) into v_row_count from private.collector_access_schedule;
  if v_row_count <> 1 then
    return false;
  end if;

  select * into v_schedule from private.collector_access_schedule limit 1;
  if v_schedule.start_time is null or v_schedule.end_time is null
     or v_schedule.timezone is distinct from 'America/Lima'
     or v_schedule.start_time >= v_schedule.end_time then
    return false;
  end if;

  v_local_time := (p_at at time zone v_schedule.timezone)::time;
  return v_local_time >= v_schedule.start_time and v_local_time < v_schedule.end_time;
end;
$$;

revoke all on function private.collector_access_is_open(timestamptz) from public, anon, authenticated;

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
      or private.collector_access_is_open(private.current_business_timestamp())
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
  v_schedule private.collector_access_schedule%rowtype;
  v_row_count bigint;
  v_schedule_valid boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.* into v_profile from public.profiles p where p.id = v_actor;
  if not found then
    raise exception 'Application profile required' using errcode = '42501';
  end if;

  v_business_date := (v_now at time zone 'America/Lima')::date;
  select count(*) into v_row_count from private.collector_access_schedule;
  if v_row_count = 1 then
    select * into v_schedule from private.collector_access_schedule limit 1;
    v_schedule_valid := v_schedule.start_time is not null
      and v_schedule.end_time is not null
      and v_schedule.timezone = 'America/Lima'
      and v_schedule.start_time < v_schedule.end_time;
  end if;

  allowed := v_profile.active
    and (
      v_profile.credentials_invalid_before is null
      or to_timestamp((select auth.jwt() ->> 'iat')::double precision)
         >= v_profile.credentials_invalid_before
    )
    and (
      v_profile.role <> 'collector'::public.app_role
      or (v_schedule_valid and private.collector_access_is_open(v_now))
    );
  role := v_profile.role;
  server_now := v_now;
  if v_schedule_valid then
    opens_at := (v_business_date + v_schedule.start_time) at time zone v_schedule.timezone;
    closes_at := (v_business_date + v_schedule.end_time) at time zone v_schedule.timezone;
  else
    opens_at := null;
    closes_at := null;
  end if;

  return next;
end;
$$;

create or replace function public.admin_get_collector_access_schedule()
returns table (start_time time, end_time time, timezone text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule private.collector_access_schedule%rowtype;
  v_row_count bigint;
begin
  perform private.require_system_administrator();
  select count(*) into v_row_count from private.collector_access_schedule;
  if v_row_count <> 1 then
    raise exception using errcode = '55000', message = 'Collector access schedule is unavailable';
  end if;
  select * into v_schedule from private.collector_access_schedule limit 1;
  if v_schedule.start_time >= v_schedule.end_time
     or v_schedule.timezone is distinct from 'America/Lima' then
    raise exception using errcode = '55000', message = 'Collector access schedule is invalid';
  end if;
  return query select v_schedule.start_time, v_schedule.end_time, v_schedule.timezone;
end;
$$;

create or replace function public.admin_update_collector_access_schedule(
  p_start_time time,
  p_end_time time,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_schedule private.collector_access_schedule%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  v_actor := private.require_system_administrator();
  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time
     or p_start_time >= time '24:00:00' or p_end_time >= time '24:00:00' then
    raise exception using errcode = '22023', message = 'Collector access schedule must have valid start and end times';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '22023', message = 'A nonblank reason is required';
  end if;

  select * into v_schedule
  from private.collector_access_schedule
  where singleton = true
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'Collector access schedule is unavailable';
  end if;
  if v_schedule.timezone is distinct from 'America/Lima'
     or v_schedule.start_time is null or v_schedule.end_time is null
     or v_schedule.start_time >= v_schedule.end_time then
    raise exception using errcode = '55000', message = 'Collector access schedule is invalid';
  end if;

  if v_schedule.start_time = p_start_time and v_schedule.end_time = p_end_time then
    return;
  end if;

  v_before := jsonb_build_object(
    'startTime', v_schedule.start_time,
    'endTime', v_schedule.end_time,
    'timezone', v_schedule.timezone
  );
  update private.collector_access_schedule
  set start_time = p_start_time, end_time = p_end_time
  where singleton = true;
  v_after := jsonb_build_object(
    'startTime', p_start_time,
    'endTime', p_end_time,
    'timezone', v_schedule.timezone
  );

  update public.profiles
  set credentials_invalid_before = clock_timestamp()
  where role = 'collector'::public.app_role and active = true;

  insert into private.access_control_audit_log(
    actor_id, action, target_type, target_id, before_data, after_data, reason
  ) values (
    v_actor,
    'collector_access_schedule_updated',
    'collector_access_schedule',
    '00000000-0000-0000-0000-000000000001'::uuid,
    v_before,
    v_after,
    btrim(p_reason)
  );
end;
$$;

revoke all on function public.current_access_status() from public, anon;
grant execute on function public.current_access_status() to authenticated;
revoke all on function public.admin_get_collector_access_schedule() from public, anon;
revoke all on function public.admin_update_collector_access_schedule(time, time, text) from public, anon;
grant execute on function public.admin_get_collector_access_schedule(),
  public.admin_update_collector_access_schedule(time, time, text) to authenticated;
