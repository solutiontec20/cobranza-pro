-- Return one authorized, filtered customer page with its page-scoped financial summary.
-- This removes the browser's sequential customer + customer_financial_status requests.

create or replace function public.admin_list_clients_page(
  p_page_index integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_collector_id uuid default null
)
returns table (
  id uuid,
  document_number text,
  full_name text,
  phone text,
  address text,
  notes text,
  collector_id uuid,
  collector_name text,
  active boolean,
  created_at timestamptz,
  outstanding_amount numeric,
  max_overdue_days integer,
  is_blacklisted boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.current_app_role();
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_search_is_document boolean := coalesce(v_search ~ '^[0-9]+$', false);
begin
  if v_role is null or v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception using
      errcode = '42501',
      message = 'Only administrators or supervisors may list clients';
  end if;

  if p_page_index < 0 then
    raise exception using errcode = '22023', message = 'Page index must be non-negative';
  end if;

  if p_page_size < 1 or p_page_size > 100 then
    raise exception using errcode = '22023', message = 'Page size must be between 1 and 100';
  end if;

  return query
  with filtered_customers as (
    select
      c.id,
      c.document_number,
      c.full_name,
      c.phone,
      c.address,
      c.notes,
      c.collector_id,
      collector.full_name as collector_name,
      c.active,
      c.created_at
    from public.customers c
    join public.profiles collector
      on collector.id = c.collector_id
    where (p_collector_id is null or c.collector_id = p_collector_id)
      and (
        v_search is null
        or (v_search_is_document and c.document_number ilike '%' || v_search || '%')
        or (not v_search_is_document and c.full_name ilike '%' || v_search || '%')
      )
  ),
  customer_count as (
    select count(*)::bigint as total_count
    from filtered_customers
  ),
  paged_customers as (
    select filtered_customers.*
    from filtered_customers
    order by created_at desc, id desc
    limit p_page_size
    offset p_page_index * p_page_size
  ),
  page_loans as (
    select l.id, l.customer_id
    from public.loans l
    join paged_customers pc
      on pc.id = l.customer_id
    where l.status = 'active'
  ),
  page_installments as (
    select
      i.id,
      pl.customer_id,
      i.due_date,
      i.scheduled_amount
    from public.installments i
    join page_loans pl
      on pl.id = i.loan_id
    where i.superseded_at is null
  ),
  allocation_totals as (
    select
      pi.id as installment_id,
      coalesce(
        sum(pa.amount) filter (where p.status = 'posted'),
        0::numeric
      )::numeric(12,2) as paid_amount
    from page_installments pi
    left join public.payment_allocations pa
      on pa.installment_id = pi.id
      and pa.superseded_at is null
    left join public.payments p
      on p.id = pa.payment_id
    group by pi.id
  ),
  installment_amounts as (
    select
      pi.customer_id,
      pi.due_date,
      greatest(
        pi.scheduled_amount - coalesce(at.paid_amount, 0::numeric),
        0::numeric
      )::numeric(12,2) as outstanding_amount
    from page_installments pi
    left join allocation_totals at
      on at.installment_id = pi.id
  ),
  financial_summary as (
    select
      ia.customer_id,
      coalesce(sum(ia.outstanding_amount), 0::numeric)::numeric(12,2)
        as outstanding_amount,
      coalesce(
        max(
          case
            when ia.outstanding_amount > 0
              and ia.due_date < ((now() at time zone 'America/Lima')::date)
            then ((now() at time zone 'America/Lima')::date - ia.due_date)
            else 0
          end
        ),
        0
      )::integer as max_overdue_days
    from installment_amounts ia
    group by ia.customer_id
  )
  select
    pc.id,
    pc.document_number,
    pc.full_name,
    pc.phone,
    pc.address,
    pc.notes,
    pc.collector_id,
    pc.collector_name,
    pc.active,
    pc.created_at,
    coalesce(fs.outstanding_amount, 0::numeric)::numeric(12,2),
    coalesce(fs.max_overdue_days, 0)::integer,
    (coalesce(fs.max_overdue_days, 0) > 5),
    cc.total_count
  from paged_customers pc
  cross join customer_count cc
  left join financial_summary fs
    on fs.customer_id = pc.id
  union all
  select
    null::uuid,
    null::text,
    null::text,
    null::text,
    null::text,
    null::text,
    null::uuid,
    null::text,
    null::boolean,
    null::timestamptz,
    null::numeric,
    null::integer,
    null::boolean,
    cc.total_count
  from customer_count cc
  where not exists (select 1 from paged_customers)
  order by 10 desc nulls last, 1 desc nulls last;
end;
$$;

revoke execute on function public.admin_list_clients_page(
  integer,
  integer,
  text,
  uuid
) from public, anon;

grant execute on function public.admin_list_clients_page(
  integer,
  integer,
  text,
  uuid
) to authenticated;

comment on function public.admin_list_clients_page(
  integer,
  integer,
  text,
  uuid
) is 'Returns an authorized customer page with financial summaries computed only for the page customer ids.';
