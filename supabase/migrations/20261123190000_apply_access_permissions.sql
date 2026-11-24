-- Apply the dynamic access-role permissions to the existing administrative operations.
--
-- The RBAC catalog and the configurable roles were introduced by
-- 20261123153531_access_control_rbac.sql. This migration makes PostgreSQL enforce those
-- permissions on every back-office operation, so hiding a button in Angular is never the only
-- protection. Domain rules (portfolio ownership, cash-day immutability, collector hours,
-- credential freshness, base-role guards) are untouched: the permission check is an ADDITIONAL
-- condition evaluated before the original body.
--
-- How the 28 RPCs are protected
--   Each function is re-created from its CURRENT definition (pg_get_functiondef) with one extra
--   statement as the first line of its main BEGIN block. Re-creating in place keeps owner, ACL,
--   security mode, search_path and comments, and guarantees the latest shipped body is the one
--   that is patched instead of a stale copy. The migration fails loudly if any function is
--   missing or cannot be patched, and it is idempotent.
--
-- Three helpers decide who the extra check applies to
--   require_back_office_permission(code)
--     Enforced for base roles admin and supervisor. Collectors pass through to the function's own
--     collector rules (many of these RPCs are shared with collectors).
--   require_back_office_any_permission(codes)
--     Same, but any one of several permissions is enough (screens that share a lookup).
--   require_admin_permission(code)
--     Enforced only for base role admin. These operations are admin-only by domain rule, so a
--     supervisor keeps receiving the function's own denial message from its existing guard.
--
-- Not covered here (documented limitation): RLS SELECT policies still decide row visibility from
-- the base role only, so a back-office user can still read tables directly through the Data API.
-- Reads that matter are served by the RPCs below. Direct writes to public.customers, which the
-- client screens perform without an RPC, are protected by the trigger at the end of this file.
--
-- Rollback: drop the trigger and helpers and re-create the 28 functions from their previous
-- migrations (see the list in supabase/tests/access_permissions_enforcement_test.sql).

create or replace function private.require_back_office_permission(p_permission_code text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.current_app_role() in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    perform private.require_permission(p_permission_code);
  end if;
end;
$$;

create or replace function private.require_back_office_any_permission(p_permission_codes text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if private.current_app_role() in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    foreach v_code in array coalesce(p_permission_codes, array[]::text[]) loop
      if private.has_permission(v_code) then
        return;
      end if;
    end loop;

    raise exception using errcode = '42501', message = 'Required access permission is missing';
  end if;
end;
$$;

create or replace function private.require_admin_permission(p_permission_code text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.current_app_role() = 'admin'::public.app_role then
    perform private.require_permission(p_permission_code);
  end if;
end;
$$;

revoke all on function
  private.require_back_office_permission(text),
  private.require_back_office_any_permission(text[]),
  private.require_admin_permission(text)
from public, anon, authenticated;

-- Several protected RPCs (the analytics ones) are SECURITY INVOKER and call these helpers as
-- `authenticated`. The helpers are SECURITY DEFINER and `private` is not exposed through the Data
-- API, matching how private.require_permission is already granted by the RBAC migration.
grant execute on function
  private.require_back_office_permission(text),
  private.require_back_office_any_permission(text[]),
  private.require_admin_permission(text)
to authenticated;


do $patch$
declare
  v_target record;
  v_oid oid;
  v_definition text;
  v_call text;
  v_patched text;
begin
  for v_target in
    select *
    from (values
      -- Dashboard and analytics (read-only)
      ('public.admin_dashboard_summary()', 'back_office', array['dashboard.view']),
      ('public.admin_dashboard_collector_performance()', 'back_office', array['dashboard.view']),
      ('public.admin_dashboard_financial_series(text,date)', 'back_office', array['analytics.view']),
      ('public.admin_analytics_series(date,date,text,uuid)', 'back_office', array['analytics.view']),
      ('public.admin_analytics_collectors(date,date)', 'back_office', array['analytics.view']),
      ('public.admin_analytics_expense_categories(date,date,uuid)', 'back_office', array['analytics.view']),
      -- Loans and payments
      ('public.admin_list_loans_page(integer,integer,text,public.loan_status,uuid,public.loan_frequency)',
        'back_office', array['loans.view']),
      ('public.admin_update_loan(uuid,numeric,numeric,public.loan_frequency,integer,date,text)',
        'back_office', array['loans.update']),
      ('public.renew_loan(uuid,numeric,numeric,public.loan_frequency,integer,date)',
        'back_office_any', array['loans.create', 'loans.update']),
      ('public.register_payment(uuid,numeric,text,timestamptz,text)',
        'back_office', array['payments.register']),
      ('public.void_payment(uuid,text)', 'back_office', array['payments.void']),
      ('public.admin_create_loan(uuid,numeric,numeric,public.loan_frequency,integer,date,date)',
        'admin', array['loans.create']),
      -- Collectors
      ('public.admin_list_collectors()', 'back_office_any',
        array['collectors.view', 'loans.view', 'clients.view']),
      ('public.admin_create_collector_profile(uuid,text,text,text)', 'admin', array['collectors.manage']),
      ('public.admin_update_collector_profile(uuid,text,text,text)', 'admin', array['collectors.manage']),
      ('public.admin_set_collector_active(uuid,boolean,text)', 'admin', array['collectors.manage']),
      ('public.admin_prepare_collector_pin_reset(uuid,text)', 'admin', array['collectors.reset_pin']),
      -- Daily control and cash closure
      ('public.admin_daily_control_report(date,uuid)', 'back_office', array['daily_control.view']),
      ('public.register_cash_opening(uuid,date,numeric,text)', 'back_office', array['cash_closure.submit']),
      ('public.validate_cash_closure(uuid,text)', 'back_office', array['cash_closure.validate']),
      ('public.review_cash_expense(uuid,boolean,text)', 'back_office', array['cash_closure.validate']),
      ('public.review_cash_allowance_request(uuid,boolean,text)', 'back_office', array['cash_closure.validate']),
      -- Correction requests
      ('public.list_correction_requests(public.correction_request_status,integer)',
        'back_office', array['correction_requests.view']),
      ('public.count_pending_correction_requests()', 'back_office', array['correction_requests.view']),
      ('public.resolve_edit_loan_request(uuid,numeric,numeric,public.loan_frequency,integer,date,text)',
        'back_office', array['correction_requests.resolve']),
      ('public.resolve_void_loan_request(uuid,text)', 'back_office', array['correction_requests.resolve']),
      ('public.resolve_void_payment_request(uuid,text)', 'back_office', array['correction_requests.resolve']),
      ('public.reject_correction_request(uuid,text)', 'back_office', array['correction_requests.reject'])
    ) as target(signature, mode, codes)
  loop
    v_oid := to_regprocedure(v_target.signature);
    if v_oid is null then
      raise exception 'Cannot apply access permissions: function % does not exist', v_target.signature;
    end if;

    v_call := case v_target.mode
      when 'back_office' then
        format('perform private.require_back_office_permission(%L);', v_target.codes[1])
      when 'admin' then
        format('perform private.require_admin_permission(%L);', v_target.codes[1])
      else
        format('perform private.require_back_office_any_permission(%L::text[]);', v_target.codes)
    end;

    v_definition := pg_get_functiondef(v_oid);

    -- Already patched: keep the migration idempotent.
    if position(v_call in v_definition) > 0 then
      continue;
    end if;

    -- Insert the check as the first statement of the main BEGIN block (the first line that
    -- contains only BEGIN). Without the g flag only that first occurrence is replaced.
    v_patched := regexp_replace(
      v_definition,
      E'(\\n[ \\t]*begin[ \\t]*\\r?\\n)',
      E'\\1  ' || replace(v_call, E'\\', E'\\\\') || E'\n',
      'i'
    );

    if v_patched = v_definition then
      raise exception 'Cannot apply access permissions: no BEGIN block found in %', v_target.signature;
    end if;

    execute v_patched;
  end loop;
end;
$patch$;


-- Client screens write to public.customers directly (no RPC), so the permission is enforced by a
-- trigger. It only acts for admin/supervisor sessions; collectors keep their RLS portfolio
-- rules, and trusted server code without an authenticated user is not affected.
create or replace function private.enforce_customer_access_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  v_role := private.current_app_role();

  -- No valid application session (trusted server code, stale or inactive profile) or a
  -- collector: nothing to add here; RLS and the other triggers keep deciding.
  if v_role is null or v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform private.require_permission('clients.create');
    return new;
  end if;

  if new.collector_id is distinct from old.collector_id then
    perform private.require_permission('clients.reassign');
  end if;

  if old.active and not new.active then
    perform private.require_permission('clients.deactivate');
  end if;

  if new.document_number is distinct from old.document_number
    or new.full_name is distinct from old.full_name
    or new.phone is distinct from old.phone
    or new.address is distinct from old.address
    or new.notes is distinct from old.notes
    or (not old.active and new.active)
  then
    perform private.require_permission('clients.update');
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_customer_access_permissions() from public, anon, authenticated;

drop trigger if exists customers_enforce_access_permissions on public.customers;
create trigger customers_enforce_access_permissions
before insert or update on public.customers
for each row execute function private.enforce_customer_access_permissions();
