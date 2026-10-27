-- ============================================================
-- ADMIN DASHBOARD SUMMARY + COLLECTOR PERFORMANCE
-- ============================================================
-- Backs the "Dashboard general" screen (modules/admin/dashboard),
-- which until now ran entirely on AppStoreService -- an in-memory
-- store seeded with hardcoded fictional clients/loans/payments and
-- persisted to localStorage (core/services/app-store.service.ts).
-- These two functions replace it with real aggregates.
--
-- Design notes / judgment calls made explicit here (the fixture's
-- own logic was the only spec, since this dashboard is not covered
-- by REQUERIMIENTO.md's confirmed business rules):
--
-- - `total_cobrado` only sums payments on currently ACTIVE loans,
--   matching the fixture's exact behavior (a fully paid-off loan's
--   payments stop counting). This may be worth revisiting with the
--   business, but this migration preserves it rather than silently
--   changing what the KPI means.
-- - "Morosidad mayor a 10 dias" / the four-tier risk distribution
--   (green 0 / yellow 1-5 / orange 6-10 / red >10 days overdue) is a
--   DIFFERENT bucketing than the >5-day automatic blacklist rule
--   confirmed in REQUERIMIENTO.md section 6
--   (`customer_financial_status.is_blacklisted`) -- this dashboard's
--   four tiers are its own, older convention and are preserved as-is.
-- - Both the risk distribution and "delayed" counts only consider
--   customers who currently have an ACTIVE loan, exactly like the
--   fixture's `getClientRiskStatus()` (a customer with no loan, or
--   only a fully paid one, is excluded rather than counted as
--   "on track").
-- - The collector performance table only lists ACTIVE collectors
--   (the fixture never modeled a deactivated collector, so this
--   detail never manifested there; showing a deactivated collector's
--   "today's operational performance" would not make sense).
-- ============================================================

create or replace function public.admin_dashboard_summary()
returns table (
  capital_prestado numeric(12,2),
  total_esperado numeric(12,2),
  total_cobrado numeric(12,2),
  saldo_pendiente numeric(12,2),
  total_clientes bigint,
  prestamos_pagados bigint,
  cobradores bigint,
  risk_green bigint,
  risk_yellow bigint,
  risk_orange bigint,
  risk_red bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
begin

  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select private.current_app_role() into v_role;

  if v_role is null then
    raise exception 'Active application profile required'
      using errcode = '42501';
  end if;

  if v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception 'Only administrators or supervisors may view the dashboard'
      using errcode = '42501';
  end if;

  return query
  select
    coalesce(
      (select sum(l.principal_amount) from public.loans l where l.status = 'active'::public.loan_status),
      0
    )::numeric(12,2) as capital_prestado,
    coalesce(
      (select sum(l.total_amount) from public.loans l where l.status = 'active'::public.loan_status),
      0
    )::numeric(12,2) as total_esperado,
    coalesce(
      (
        select sum(p.amount)
        from public.payments p
        join public.loans l on l.id = p.loan_id
        where p.status = 'posted'::public.payment_status
          and l.status = 'active'::public.loan_status
      ),
      0
    )::numeric(12,2) as total_cobrado,
    coalesce(
      (select sum(cfs.outstanding_amount) from public.customer_financial_status cfs),
      0
    )::numeric(12,2) as saldo_pendiente,
    coalesce(
      (select count(*) from public.customers c where c.active = true),
      0
    )::bigint as total_clientes,
    coalesce(
      (select count(*) from public.loans l where l.status = 'paid'::public.loan_status),
      0
    )::bigint as prestamos_pagados,
    coalesce(
      (
        select count(*)
        from public.profiles pr
        where pr.role = 'collector'::public.app_role and pr.active = true
      ),
      0
    )::bigint as cobradores,
    coalesce(
      (
        select count(*)
        from public.loans l
        join public.customer_financial_status cfs on cfs.customer_id = l.customer_id
        where l.status = 'active'::public.loan_status and cfs.max_overdue_days = 0
      ),
      0
    )::bigint as risk_green,
    coalesce(
      (
        select count(*)
        from public.loans l
        join public.customer_financial_status cfs on cfs.customer_id = l.customer_id
        where l.status = 'active'::public.loan_status and cfs.max_overdue_days between 1 and 5
      ),
      0
    )::bigint as risk_yellow,
    coalesce(
      (
        select count(*)
        from public.loans l
        join public.customer_financial_status cfs on cfs.customer_id = l.customer_id
        where l.status = 'active'::public.loan_status and cfs.max_overdue_days between 6 and 10
      ),
      0
    )::bigint as risk_orange,
    coalesce(
      (
        select count(*)
        from public.loans l
        join public.customer_financial_status cfs on cfs.customer_id = l.customer_id
        where l.status = 'active'::public.loan_status and cfs.max_overdue_days > 10
      ),
      0
    )::bigint as risk_red;
end;
$$;

revoke execute
on function public.admin_dashboard_summary()
from public, anon;

grant execute
on function public.admin_dashboard_summary()
to authenticated;


create or replace function public.admin_dashboard_collector_performance()
returns table (
  collector_id uuid,
  collector_name text,
  collector_dni text,
  clients_count bigint,
  expected_today numeric(12,2),
  collected_today numeric(12,2),
  pending_today numeric(12,2),
  delayed_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_today date;
begin

  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select private.current_app_role() into v_role;

  if v_role is null then
    raise exception 'Active application profile required'
      using errcode = '42501';
  end if;

  if v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception 'Only administrators or supervisors may view the dashboard'
      using errcode = '42501';
  end if;

  v_today := (now() at time zone 'America/Lima')::date;

  return query
  with expected as (
    select
      c.collector_id,
      coalesce(sum(i.scheduled_amount), 0)::numeric(12,2) as expected_today
    from public.loans l
    join public.customers c
      on c.id = l.customer_id
    join public.installments i
      on i.loan_id = l.id
      and i.superseded_at is null
      and i.due_date = v_today
    where l.status = 'active'::public.loan_status
    group by c.collector_id
  ),
  collected as (
    select
      p.collector_id,
      coalesce(sum(p.amount), 0)::numeric(12,2) as collected_today
    from public.payments p
    where p.status = 'posted'::public.payment_status
      and p.business_date = v_today
    group by p.collector_id
  ),
  delayed as (
    select
      c.collector_id,
      count(*) as delayed_count
    from public.customers c
    join public.customer_financial_status cfs
      on cfs.customer_id = c.id
    where cfs.max_overdue_days > 0
    group by c.collector_id
  ),
  clients_per_collector as (
    select
      c.collector_id,
      count(*) as clients_count
    from public.customers c
    group by c.collector_id
  )
  select
    pr.id as collector_id,
    pr.full_name as collector_name,
    pr.dni as collector_dni,
    coalesce(cpc.clients_count, 0)::bigint as clients_count,
    coalesce(e.expected_today, 0)::numeric(12,2) as expected_today,
    coalesce(cl.collected_today, 0)::numeric(12,2) as collected_today,
    greatest(
      coalesce(e.expected_today, 0) - coalesce(cl.collected_today, 0),
      0
    )::numeric(12,2) as pending_today,
    coalesce(d.delayed_count, 0)::bigint as delayed_count
  from public.profiles pr
  left join expected e on e.collector_id = pr.id
  left join collected cl on cl.collector_id = pr.id
  left join delayed d on d.collector_id = pr.id
  left join clients_per_collector cpc on cpc.collector_id = pr.id
  where pr.role = 'collector'::public.app_role
    and pr.active = true
  order by pr.full_name asc;
end;
$$;

revoke execute
on function public.admin_dashboard_collector_performance()
from public, anon;

grant execute
on function public.admin_dashboard_collector_performance()
to authenticated;
