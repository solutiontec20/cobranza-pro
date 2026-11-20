-- Fix the paginated loan summary return contract for the smallint-backed installment_count column.
-- The browser must never download every installment/payment merely to render
-- one list page: hosted PostgREST responses are capped and financial history
-- grows continuously.

create or replace function public.admin_list_loans_page(
  p_page_index integer default 0,
  p_page_size integer default 10,
  p_search text default null,
  p_status public.loan_status default null,
  p_collector_id uuid default null,
  p_frequency public.loan_frequency default null
)
returns table (
  id uuid,
  customer_id uuid,
  client_name text,
  client_dni text,
  collector_id uuid,
  collector_name text,
  principal_amount numeric,
  interest_rate_percent numeric,
  total_amount numeric,
  installment_amount numeric,
  installment_count integer,
  frequency public.loan_frequency,
  balance numeric,
  status public.loan_status,
  started_on date,
  end_date date,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.current_app_role();
  v_search text := nullif(
    translate(lower(btrim(coalesce(p_search, ''))), 'áéíóúüñ', 'aeiouun'),
    ''
  );
begin
  if v_role is null or v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role) then
    raise exception using
      errcode = '42501',
      message = 'Only administrators or supervisors may list loans';
  end if;

  if p_page_index < 0 then
    raise exception using errcode = '22023', message = 'Page index must be non-negative';
  end if;

  if p_page_size < 1 or p_page_size > 100 then
    raise exception using errcode = '22023', message = 'Page size must be between 1 and 100';
  end if;

  return query
  with filtered_loans as (
    select
      l.id,
      l.customer_id,
      c.full_name as client_name,
      c.document_number as client_dni,
      c.collector_id,
      collector.full_name as collector_name,
      l.principal_amount,
      l.interest_rate_percent,
      l.total_amount,
      l.installment_count,
      l.frequency,
      l.status,
      l.started_on,
      l.created_at
    from public.loans l
    join public.customers c on c.id = l.customer_id
    join public.profiles collector on collector.id = c.collector_id
    where (p_status is null or l.status = p_status)
      and (p_collector_id is null or c.collector_id = p_collector_id)
      and (p_frequency is null or l.frequency = p_frequency)
      and (
        v_search is null
        or translate(lower(c.full_name), 'áéíóúüñ', 'aeiouun') like '%' || v_search || '%'
        or c.document_number like '%' || v_search || '%'
        or translate(lower(collector.full_name), 'áéíóúüñ', 'aeiouun')
          like '%' || v_search || '%'
      )
  ),
  paged_loans as (
    select filtered_loans.*, count(*) over () as total_count
    from filtered_loans
    order by created_at desc, id desc
    limit p_page_size
    offset p_page_index * p_page_size
  ),
  schedule_summary as (
    select
      ib.loan_id,
      max(ib.scheduled_amount) filter (where ib.installment_number = 1) as installment_amount,
      max(ib.due_date) as end_date
    from public.installment_balances ib
    where ib.loan_id in (select paged_loans.id from paged_loans)
    group by ib.loan_id
  ),
  payment_summary as (
    select
      p.loan_id,
      coalesce(sum(p.amount) filter (where p.status = 'posted'), 0::numeric) as paid_amount
    from public.payments p
    where p.loan_id in (select paged_loans.id from paged_loans)
    group by p.loan_id
  )
  select
    pl.id,
    pl.customer_id,
    pl.client_name,
    pl.client_dni,
    pl.collector_id,
    pl.collector_name,
    pl.principal_amount,
    pl.interest_rate_percent,
    pl.total_amount,
    ss.installment_amount,
    pl.installment_count::integer,
    pl.frequency,
    round(greatest(pl.total_amount - coalesce(ps.paid_amount, 0::numeric), 0::numeric), 2),
    pl.status,
    pl.started_on,
    ss.end_date,
    pl.created_at,
    pl.total_count
  from paged_loans pl
  left join schedule_summary ss on ss.loan_id = pl.id
  left join payment_summary ps on ps.loan_id = pl.id
  order by pl.created_at desc, pl.id desc;
end;
$$;

revoke all on function public.admin_list_loans_page(
  integer,
  integer,
  text,
  public.loan_status,
  uuid,
  public.loan_frequency
) from public;

grant execute on function public.admin_list_loans_page(
  integer,
  integer,
  text,
  public.loan_status,
  uuid,
  public.loan_frequency
) to authenticated;

comment on function public.admin_list_loans_page(
  integer,
  integer,
  text,
  public.loan_status,
  uuid,
  public.loan_frequency
) is 'Returns an authorized, filtered page of admin loan summaries without loading full installment or payment history.';
