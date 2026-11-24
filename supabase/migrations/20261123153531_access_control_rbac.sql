-- Database-authoritative dynamic permissions for administrative profiles.
-- Collectors keep their existing operational-role and portfolio authorization.

create table private.access_roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint access_roles_slug_format check (slug ~ '^[a-z][a-z0-9_]*$'),
  constraint access_roles_name_nonblank check (btrim(name) <> '')
);

create table private.access_permissions (
  code text primary key,
  module text not null,
  action text not null,
  label text not null,
  description text not null,
  risk_level text not null check (risk_level in ('normal', 'sensitive', 'restricted')),
  active boolean not null default true
);

create table private.access_role_permissions (
  role_id uuid not null references private.access_roles(id) on delete cascade,
  permission_code text not null references private.access_permissions(code),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default clock_timestamp(),
  primary key (role_id, permission_code)
);

create table private.profile_access_roles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  role_id uuid not null references private.access_roles(id),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default clock_timestamp()
);

create index profile_access_roles_role_id_idx on private.profile_access_roles(role_id);

create table private.access_control_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  before_data jsonb not null,
  after_data jsonb not null,
  reason text not null check (btrim(reason) <> ''),
  created_at timestamptz not null default clock_timestamp()
);

revoke all on private.access_roles, private.access_permissions,
  private.access_role_permissions, private.profile_access_roles,
  private.access_control_audit_log from public, anon, authenticated;
alter table private.access_roles enable row level security;
alter table private.access_permissions enable row level security;
alter table private.access_role_permissions enable row level security;
alter table private.profile_access_roles enable row level security;
alter table private.access_control_audit_log enable row level security;

insert into private.access_permissions (code, module, action, label, description, risk_level) values
  ('dashboard.view', 'dashboard', 'view', 'Dashboard', 'View the operational dashboard.', 'normal'),
  ('analytics.view', 'analytics', 'view', 'Analytics', 'View historical analytics.', 'normal'),
  ('clients.view', 'clients', 'view', 'View clients', 'List and view client records.', 'normal'),
  ('clients.create', 'clients', 'create', 'Create clients', 'Create client records.', 'normal'),
  ('clients.update', 'clients', 'update', 'Update clients', 'Update client records.', 'normal'),
  ('clients.reassign', 'clients', 'reassign', 'Reassign clients', 'Change client portfolio ownership.', 'sensitive'),
  ('clients.deactivate', 'clients', 'deactivate', 'Deactivate clients', 'Deactivate client records.', 'sensitive'),
  ('loans.view', 'loans', 'view', 'View loans', 'View loans and their balances.', 'normal'),
  ('loans.create', 'loans', 'create', 'Create loans', 'Create and disburse loans.', 'sensitive'),
  ('loans.update', 'loans', 'update', 'Update loans', 'Edit loan terms.', 'sensitive'),
  ('loans.void', 'loans', 'void', 'Void loans', 'Void loans and reverse effects.', 'restricted'),
  ('payments.view', 'payments', 'view', 'View payments', 'View posted and pending payments.', 'normal'),
  ('payments.register', 'payments', 'register', 'Register payments', 'Register customer payments.', 'sensitive'),
  ('payments.void', 'payments', 'void', 'Void payments', 'Void posted payments.', 'restricted'),
  ('collectors.view', 'collectors', 'view', 'View collectors', 'View collector profiles.', 'normal'),
  ('collectors.manage', 'collectors', 'manage', 'Manage collectors', 'Create and update collectors.', 'sensitive'),
  ('collectors.reset_pin', 'collectors', 'reset_pin', 'Reset collector PIN', 'Reset collector credentials.', 'restricted'),
  ('daily_control.view', 'daily_control', 'view', 'View daily control', 'View daily collection control.', 'normal'),
  ('daily_control.export', 'daily_control', 'export', 'Export daily control', 'Export daily control reports.', 'sensitive'),
  ('cash_closure.view', 'cash_closure', 'view', 'View cash closures', 'View cash closure records.', 'normal'),
  ('cash_closure.submit', 'cash_closure', 'submit', 'Submit cash closures', 'Submit cash closures.', 'sensitive'),
  ('cash_closure.validate', 'cash_closure', 'validate', 'Validate cash closures', 'Validate and lock cash closures.', 'restricted'),
  ('correction_requests.view', 'correction_requests', 'view', 'View correction requests', 'View submitted correction requests.', 'normal'),
  ('correction_requests.resolve', 'correction_requests', 'resolve', 'Resolve correction requests', 'Apply approved correction requests.', 'restricted'),
  ('correction_requests.reject', 'correction_requests', 'reject', 'Reject correction requests', 'Reject correction requests.', 'sensitive'),
  ('audit.view', 'audit', 'view', 'View audit', 'View audit events.', 'sensitive'),
  ('roles.view', 'roles', 'view', 'View access roles', 'View role and assignment configuration.', 'normal'),
  ('roles.manage', 'roles', 'manage', 'Manage access roles', 'Create roles and change access assignments.', 'restricted');

insert into private.access_roles (slug, name, description, is_system)
values
  ('system_administrator', 'System administrator', 'Reserved full-access role.', true),
  ('supervisor_default', 'Default supervisor', 'Compatibility role for existing supervisors.', true);

insert into private.access_role_permissions (role_id, permission_code)
select role_row.id, permission.code
from private.access_roles role_row
cross join private.access_permissions permission
where role_row.slug = 'system_administrator';

insert into private.access_role_permissions (role_id, permission_code)
select role_row.id, permission.code
from private.access_roles role_row
cross join private.access_permissions permission
where role_row.slug = 'supervisor_default'
  and permission.code not in (
    'loans.create',
    'collectors.manage',
    'collectors.reset_pin',
    'roles.manage'
  );

-- Existing admins retain full access; supervisors retain their existing non-RBAC access.
insert into private.profile_access_roles (profile_id, role_id, assigned_by)
select p.id, r.id, p.id
from public.profiles p
join private.access_roles r
  on r.slug = case p.role
    when 'admin'::public.app_role then 'system_administrator'
    when 'supervisor'::public.app_role then 'supervisor_default'
  end
where p.active and p.role in ('admin'::public.app_role, 'supervisor'::public.app_role)
on conflict (profile_id) do nothing;

create or replace function private.assign_default_access_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_role_id uuid;
  v_role_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.role is not distinct from old.role then
      return new;
    end if;
    v_role_changed := true;
  end if;

  v_slug := case new.role
    when 'admin'::public.app_role then 'system_administrator'
    when 'supervisor'::public.app_role then 'supervisor_default'
    else null
  end;
  if v_slug is not null then
    select r.id into v_role_id from private.access_roles r where r.slug = v_slug;
    insert into private.profile_access_roles(profile_id, role_id, assigned_by)
    values (new.id, v_role_id, new.id)
    on conflict (profile_id) do update set
      role_id = excluded.role_id,
      assigned_by = excluded.assigned_by,
      assigned_at = clock_timestamp()
    where private.profile_access_roles.role_id is distinct from excluded.role_id;
  else
    delete from private.profile_access_roles where profile_id = new.id;
  end if;

  if v_role_changed then
    update public.profiles
    set credentials_invalid_before = date_trunc('second', clock_timestamp())
    where id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_assign_default_access_role
after insert or update of role on public.profiles
for each row execute function private.assign_default_access_role();

create or replace function private.has_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.profile_access_roles assignment
    join private.access_roles role_row on role_row.id = assignment.role_id and role_row.active
    join private.access_role_permissions role_permission on role_permission.role_id = role_row.id
    join private.access_permissions permission
      on permission.code = role_permission.permission_code and permission.active
    where assignment.profile_id = (select auth.uid())
      and permission.code = p_permission_code
      and private.current_app_role() in ('admin'::public.app_role, 'supervisor'::public.app_role)
  );
$$;

create or replace function private.require_permission(p_permission_code text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_permission_code) then
    raise exception using errcode = '42501', message = 'Required access permission is missing';
  end if;
end;
$$;

create or replace function private.require_system_administrator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  perform private.require_permission('roles.manage');
  if not exists (
    select 1 from private.profile_access_roles assignment
    join private.access_roles role_row on role_row.id = assignment.role_id
    where assignment.profile_id = v_actor and role_row.slug = 'system_administrator'
      and role_row.active and role_row.is_system
  ) then
    raise exception using errcode = '42501', message = 'System administrator access required';
  end if;
  return v_actor;
end;
$$;

create or replace function private.validate_access_permissions(p_codes text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_codes text[] := coalesce(p_codes, array[]::text[]);
begin
  if cardinality(v_codes) <> (
    select count(distinct requested.code) from unnest(v_codes) as requested(code)
  ) then
    raise exception using errcode = '22023', message = 'Permission codes must be unique';
  end if;
  if exists (
    select 1 from unnest(v_codes) as requested(code)
    left join private.access_permissions permission on permission.code = requested.code and permission.active
    where permission.code is null
  ) then
    raise exception using errcode = '22023', message = 'Unknown or inactive permission code';
  end if;
  if exists (
    select 1 from unnest(v_codes) as requested(code)
    join private.access_permissions permission on permission.code = requested.code
    where permission.risk_level = 'restricted'
  ) then
    raise exception using errcode = '42501', message = 'Restricted permissions require the system administrator role';
  end if;
  if exists (
    select 1 from unnest(v_codes) as requested(code)
    join private.access_permissions permission on permission.code = requested.code
    where permission.action <> 'view'
      and not (permission.module || '.view' = any(v_codes))
  ) then
    raise exception using errcode = '22023', message = 'Each action permission requires its module view permission';
  end if;
  return v_codes;
end;
$$;

create or replace function public.current_access_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'baseRole', profile.role,
    'accessRole', role_row.slug,
    'permissions', coalesce(permission_list.codes, '[]'::jsonb),
    'updatedAt', greatest(assignment.assigned_at, role_row.updated_at),
    'operational', private.current_app_role() is not null
  )
  from public.profiles profile
  left join private.profile_access_roles assignment on assignment.profile_id = profile.id
  left join private.access_roles role_row on role_row.id = assignment.role_id and role_row.active
  left join lateral (
    select jsonb_agg(permission.code order by permission.module, permission.action) as codes
    from private.access_role_permissions role_permission
    join private.access_permissions permission on permission.code = role_permission.permission_code
    where role_permission.role_id = role_row.id and permission.active
  ) permission_list on true
  where profile.id = (select auth.uid())
    and private.current_app_role() is not null
  union all
  select jsonb_build_object(
    'baseRole', profile.role, 'accessRole', null, 'permissions', '[]'::jsonb,
    'updatedAt', null, 'operational', false
  )
  from public.profiles profile
  where profile.id = (select auth.uid()) and private.current_app_role() is null
  limit 1;
$$;

create or replace function public.admin_list_access_roles()
returns table (
  role_id uuid, slug text, name text, description text, active boolean,
  is_system boolean, assigned_users bigint, permissions text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('roles.view');
  return query
  select r.id, r.slug, r.name, r.description, r.active, r.is_system,
    (select count(*) from private.profile_access_roles a where a.role_id = r.id),
    coalesce(array_agg(rp.permission_code order by rp.permission_code)
      filter (where rp.permission_code is not null), array[]::text[])
  from private.access_roles r
  left join private.access_role_permissions rp on rp.role_id = r.id
  group by r.id order by r.is_system desc, r.name;
end;
$$;

create or replace function public.admin_get_access_role(p_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_permission('roles.view');
  select jsonb_build_object(
    'roleId', r.id, 'slug', r.slug, 'name', r.name, 'description', r.description,
    'active', r.active, 'isSystem', r.is_system,
    'permissions', coalesce(jsonb_agg(rp.permission_code order by rp.permission_code)
      filter (where rp.permission_code is not null), '[]'::jsonb)
  ) into v_result
  from private.access_roles r
  left join private.access_role_permissions rp on rp.role_id = r.id
  where r.id = p_role_id group by r.id;
  if v_result is null then raise exception using errcode = 'P0002', message = 'Access role not found'; end if;
  return v_result;
end;
$$;

create or replace function public.admin_create_access_role(
  p_name text, p_description text, p_permission_codes text[], p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_id uuid;
  v_slug text;
  v_codes text[];
  v_after jsonb;
begin
  v_actor := private.require_system_administrator();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '22023', message = 'A nonblank reason is required';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception using errcode = '22023', message = 'Role name is required';
  end if;
  v_codes := private.validate_access_permissions(p_permission_codes);
  v_slug := 'custom_' || coalesce(
    nullif(trim(both '_' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '_', 'g')), ''),
    'access'
  ) || '_' || substr(gen_random_uuid()::text, 1, 8);
  insert into private.access_roles(slug, name, description, created_by)
  values (v_slug, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), v_actor)
  returning id into v_id;
  insert into private.access_role_permissions(role_id, permission_code, granted_by)
  select v_id, requested.code, v_actor from unnest(v_codes) as requested(code);
  v_after := jsonb_build_object('roleId', v_id, 'slug', v_slug, 'name', btrim(p_name),
    'description', nullif(btrim(coalesce(p_description, '')), ''), 'active', true, 'permissions', v_codes);
  insert into private.access_control_audit_log(actor_id, action, target_type, target_id,
    before_data, after_data, reason)
  values (v_actor, 'role_created', 'role', v_id, '{}'::jsonb, v_after, btrim(p_reason));
  return v_id;
end;
$$;

create or replace function public.admin_update_access_role(
  p_role_id uuid, p_name text, p_description text, p_permission_codes text[], p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role private.access_roles%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_codes text[];
begin
  v_actor := private.require_system_administrator();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '22023', message = 'A nonblank reason is required';
  end if;
  select * into v_role from private.access_roles where id = p_role_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Access role not found'; end if;
  if v_role.is_system then raise exception using errcode = '42501', message = 'System roles cannot be modified'; end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception using errcode = '22023', message = 'Role name is required';
  end if;
  v_codes := private.validate_access_permissions(p_permission_codes);
  select jsonb_build_object('name', v_role.name, 'description', v_role.description,
    'permissions', coalesce(jsonb_agg(rp.permission_code order by rp.permission_code)
      filter (where rp.permission_code is not null), '[]'::jsonb))
  into v_before from private.access_role_permissions rp where rp.role_id = v_role.id;
  update private.access_roles set name = btrim(p_name),
    description = nullif(btrim(coalesce(p_description, '')), ''),
    updated_at = clock_timestamp() where id = v_role.id;
  delete from private.access_role_permissions where role_id = v_role.id;
  insert into private.access_role_permissions(role_id, permission_code, granted_by)
  select v_role.id, requested.code, v_actor from unnest(v_codes) as requested(code);
  update public.profiles p set credentials_invalid_before = date_trunc('second', clock_timestamp())
  where p.id in (select assignment.profile_id from private.profile_access_roles assignment
    where assignment.role_id = v_role.id);
  v_after := jsonb_build_object('name', btrim(p_name),
    'description', nullif(btrim(coalesce(p_description, '')), ''), 'permissions', v_codes);
  insert into private.access_control_audit_log(actor_id, action, target_type, target_id,
    before_data, after_data, reason)
  values (v_actor, 'role_updated', 'role', v_role.id, coalesce(v_before, '{}'::jsonb), v_after, btrim(p_reason));
end;
$$;

create or replace function public.admin_set_access_role_active(p_role_id uuid, p_active boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_role private.access_roles%rowtype;
begin
  v_actor := private.require_system_administrator();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '22023', message = 'A nonblank reason is required';
  end if;
  select * into v_role from private.access_roles where id = p_role_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Access role not found'; end if;
  if v_role.is_system then raise exception using errcode = '42501', message = 'System roles cannot be modified'; end if;
  if not p_active and exists (select 1 from private.profile_access_roles where role_id = v_role.id) then
    raise exception using errcode = '23514', message = 'An assigned role cannot be deactivated';
  end if;
  update private.access_roles set active = p_active, updated_at = clock_timestamp() where id = v_role.id;
  insert into private.access_control_audit_log(actor_id, action, target_type, target_id,
    before_data, after_data, reason)
  values (v_actor, 'role_active_changed', 'role', v_role.id,
    jsonb_build_object('active', v_role.active), jsonb_build_object('active', p_active), btrim(p_reason));
end;
$$;

create or replace function public.admin_list_access_assignments()
returns table (profile_id uuid, full_name text, dni text, base_role public.app_role,
  access_role_id uuid, access_role_slug text, access_role_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('roles.view');
  return query select p.id, p.full_name, p.dni, p.role, r.id, r.slug, r.name
  from public.profiles p join private.profile_access_roles a on a.profile_id = p.id
  join private.access_roles r on r.id = a.role_id
  where p.active and p.role in ('admin'::public.app_role, 'supervisor'::public.app_role)
  order by p.full_name, p.id;
end;
$$;

create or replace function public.admin_assign_access_role(p_profile_id uuid, p_role_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_profile public.profiles%rowtype;
  v_target private.access_roles%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_old_slug text;
  v_system_admin_count bigint;
begin
  v_actor := private.require_system_administrator();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '22023', message = 'A nonblank reason is required';
  end if;
  if p_profile_id = v_actor then
    raise exception using errcode = '42501', message = 'Self assignment is prohibited';
  end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found or not v_profile.active or v_profile.role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception using errcode = '42501', message = 'Only active administrative profiles can be assigned';
  end if;
  select * into v_target from private.access_roles where id = p_role_id and active for share;
  if not found then raise exception using errcode = '22023', message = 'Target access role must be active'; end if;
  if v_target.slug = 'system_administrator' then
    raise exception using errcode = '42501', message = 'The reserved system-administrator role cannot be newly assigned';
  end if;
  select r.slug into v_old_slug from private.profile_access_roles a
  join private.access_roles r on r.id = a.role_id where a.profile_id = p_profile_id;
  if v_old_slug = 'system_administrator' then
    select count(*) into v_system_admin_count from private.profile_access_roles a
    join private.access_roles r on r.id = a.role_id
    join public.profiles p on p.id = a.profile_id
    where r.slug = 'system_administrator' and r.active and p.active and p.role = 'admin'::public.app_role;
    if v_system_admin_count <= 1 then
      raise exception using errcode = '23514', message = 'The last system administrator cannot be removed';
    end if;
  end if;
  select jsonb_build_object('profileId', v_profile.id, 'baseRole', v_profile.role,
    'accessRoleId', a.role_id, 'accessRoleSlug', old_role.slug)
  into v_before from private.profile_access_roles a
  join private.access_roles old_role on old_role.id = a.role_id where a.profile_id = p_profile_id;
  v_before := coalesce(v_before, '{}'::jsonb);
  insert into private.profile_access_roles(profile_id, role_id, assigned_by)
  values (p_profile_id, p_role_id, v_actor)
  on conflict (profile_id) do update set role_id = excluded.role_id,
    assigned_by = excluded.assigned_by, assigned_at = clock_timestamp();
  update public.profiles set credentials_invalid_before = date_trunc('second', clock_timestamp())
  where id = p_profile_id;
  v_after := jsonb_build_object('profileId', v_profile.id, 'baseRole', v_profile.role,
    'accessRoleId', v_target.id, 'accessRoleSlug', v_target.slug);
  insert into private.access_control_audit_log(actor_id, action, target_type, target_id,
    before_data, after_data, reason)
  values (v_actor, 'assignment_changed', 'profile_assignment', p_profile_id,
    v_before, v_after, btrim(p_reason));
end;
$$;

revoke all on function private.assign_default_access_role() from public, anon, authenticated;
revoke all on function private.has_permission(text), private.require_permission(text),
  private.require_system_administrator(), private.validate_access_permissions(text[])
  from public, anon, authenticated;
grant execute on function private.has_permission(text), private.require_permission(text)
  to authenticated;

revoke all on function public.current_access_context(),
  public.admin_list_access_roles(), public.admin_get_access_role(uuid),
  public.admin_create_access_role(text, text, text[], text),
  public.admin_update_access_role(uuid, text, text, text[], text),
  public.admin_set_access_role_active(uuid, boolean, text),
  public.admin_list_access_assignments(), public.admin_assign_access_role(uuid, uuid, text)
  from public, anon;
grant execute on function public.current_access_context(), public.admin_list_access_roles(),
  public.admin_get_access_role(uuid), public.admin_create_access_role(text, text, text[], text),
  public.admin_update_access_role(uuid, text, text, text[], text),
  public.admin_set_access_role_active(uuid, boolean, text),
  public.admin_list_access_assignments(), public.admin_assign_access_role(uuid, uuid, text)
  to authenticated;

-- Protect the first low-risk read while retaining its established query contract.
create or replace function public.admin_list_clients_page(
  p_page_index integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_collector_id uuid default null
)
returns table (
  id uuid, document_number text, full_name text, phone text, address text, notes text,
  collector_id uuid, collector_name text, active boolean, created_at timestamptz,
  outstanding_amount numeric, max_overdue_days integer, is_blacklisted boolean, total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_search_is_document boolean := coalesce(v_search ~ '^[0-9]+$', false);
begin
  perform private.require_permission('clients.view');
  if p_page_index < 0 then
    raise exception using errcode = '22023', message = 'Page index must be non-negative';
  end if;
  if p_page_size < 1 or p_page_size > 100 then
    raise exception using errcode = '22023', message = 'Page size must be between 1 and 100';
  end if;
  return query
  with filtered_customers as (
    select c.id, c.document_number, c.full_name, c.phone, c.address, c.notes,
      c.collector_id, collector.full_name as collector_name, c.active, c.created_at
    from public.customers c join public.profiles collector on collector.id = c.collector_id
    where (p_collector_id is null or c.collector_id = p_collector_id)
      and (v_search is null or (v_search_is_document and c.document_number ilike '%' || v_search || '%')
        or (not v_search_is_document and c.full_name ilike '%' || v_search || '%'))
  ), customer_count as (
    select count(*)::bigint as total_count from filtered_customers
  ), paged_customers as (
    select filtered_customers.* from filtered_customers
    order by created_at desc, id desc limit p_page_size offset p_page_index * p_page_size
  ), page_loans as (
    select l.id, l.customer_id from public.loans l join paged_customers pc on pc.id = l.customer_id
    where l.status = 'active'
  ), page_installments as (
    select i.id, pl.customer_id, i.due_date, i.scheduled_amount
    from public.installments i join page_loans pl on pl.id = i.loan_id where i.superseded_at is null
  ), allocation_totals as (
    select pi.id as installment_id,
      coalesce(sum(pa.amount) filter (where p.status = 'posted'), 0::numeric)::numeric(12,2) as paid_amount
    from page_installments pi left join public.payment_allocations pa
      on pa.installment_id = pi.id and pa.superseded_at is null
    left join public.payments p on p.id = pa.payment_id group by pi.id
  ), installment_amounts as (
    select pi.customer_id, pi.due_date,
      greatest(pi.scheduled_amount - coalesce(at.paid_amount, 0::numeric), 0::numeric)::numeric(12,2) as outstanding_amount
    from page_installments pi left join allocation_totals at on at.installment_id = pi.id
  ), financial_summary as (
    select ia.customer_id,
      coalesce(sum(ia.outstanding_amount), 0::numeric)::numeric(12,2) as outstanding_amount,
      coalesce(max(case when ia.outstanding_amount > 0
        and ia.due_date < ((now() at time zone 'America/Lima')::date)
        then ((now() at time zone 'America/Lima')::date - ia.due_date) else 0 end), 0)::integer as max_overdue_days
    from installment_amounts ia group by ia.customer_id
  )
  select pc.id, pc.document_number, pc.full_name, pc.phone, pc.address, pc.notes,
    pc.collector_id, pc.collector_name, pc.active, pc.created_at,
    coalesce(fs.outstanding_amount, 0::numeric)::numeric(12,2), coalesce(fs.max_overdue_days, 0)::integer,
    (coalesce(fs.max_overdue_days, 0) > 5), cc.total_count
  from paged_customers pc cross join customer_count cc left join financial_summary fs on fs.customer_id = pc.id
  union all
  select null::uuid, null::text, null::text, null::text, null::text, null::text, null::uuid,
    null::text, null::boolean, null::timestamptz, null::numeric, null::integer, null::boolean, cc.total_count
  from customer_count cc where not exists (select 1 from paged_customers)
  order by 10 desc nulls last, 1 desc nulls last;
end;
$$;

revoke execute on function public.admin_list_clients_page(integer, integer, text, uuid) from public, anon;
grant execute on function public.admin_list_clients_page(integer, integer, text, uuid) to authenticated;
comment on function public.admin_list_clients_page(integer, integer, text, uuid)
  is 'Returns a paginated customer list only to actors with clients.view; financial summaries remain page-scoped.';
