-- Realtime is used as an invalidation signal for correction-request notifications.
-- Persisted requests and read receipts remain the source of truth after reconnects.

create table public.correction_request_reads (
  request_id uuid not null references public.correction_requests(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  read_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

alter table public.correction_request_reads enable row level security;

revoke all on table public.correction_request_reads from public, anon, authenticated;

create index correction_request_reads_user_read_idx
  on public.correction_request_reads (user_id, read_at desc, request_id);

create or replace function public.list_my_correction_requests(
  p_limit integer default 20
)
returns table (
  id uuid,
  request_type public.correction_request_type,
  status public.correction_request_status,
  loan_id uuid,
  payment_id uuid,
  requested_by uuid,
  reason text,
  proposed_changes jsonb,
  handled_by uuid,
  handled_at timestamptz,
  resolution_note text,
  created_at timestamptz,
  customer_id uuid,
  customer_name text,
  customer_document text,
  collector_id uuid,
  collector_name text,
  loan_status public.loan_status,
  loan_frequency public.loan_frequency,
  loan_started_on date,
  loan_principal numeric(12,2),
  loan_interest_rate numeric(7,4),
  loan_installment_count smallint,
  loan_total numeric(12,2),
  payment_amount numeric(12,2),
  payment_date date,
  payment_status public.payment_status,
  payment_method text,
  read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if (select private.current_app_role()) is distinct from 'collector'::public.app_role then
    raise exception 'Only active collectors may list their correction requests'
      using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Request list limit must be between 1 and 100'
      using errcode = '22023';
  end if;

  return query
  select
    cr.id,
    cr.request_type,
    cr.status,
    cr.loan_id,
    cr.payment_id,
    cr.requested_by,
    cr.reason,
    cr.proposed_changes,
    cr.handled_by,
    cr.handled_at,
    cr.resolution_note,
    cr.created_at,
    c.id,
    c.full_name,
    c.document_number,
    c.collector_id,
    collector.full_name,
    l.status,
    l.frequency,
    l.started_on,
    l.principal_amount,
    l.interest_rate_percent,
    l.installment_count,
    l.total_amount,
    p.amount,
    p.business_date,
    p.status,
    p.payment_method,
    reads.read_at
  from public.correction_requests cr
  join public.loans l on l.id = cr.loan_id
  join public.customers c on c.id = l.customer_id
  join public.profiles collector on collector.id = c.collector_id
  left join public.payments p on p.id = cr.payment_id
  left join public.correction_request_reads reads
    on reads.request_id = cr.id
   and reads.user_id = v_actor
  where cr.requested_by = v_actor
  order by cr.created_at desc, cr.id desc
  limit p_limit;
end;
$$;

create or replace function public.count_my_unread_correction_requests()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_count bigint;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if (select private.current_app_role()) is distinct from 'collector'::public.app_role then
    raise exception 'Only active collectors may count their correction notifications'
      using errcode = '42501';
  end if;

  select count(*) into v_count
  from public.correction_requests cr
  left join public.correction_request_reads reads
    on reads.request_id = cr.id
   and reads.user_id = v_actor
  where cr.requested_by = v_actor
    and cr.status in (
      'resolved'::public.correction_request_status,
      'rejected'::public.correction_request_status
    )
    and reads.request_id is null;

  return v_count;
end;
$$;

create or replace function public.mark_my_correction_requests_read()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_inserted bigint;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if (select private.current_app_role()) is distinct from 'collector'::public.app_role then
    raise exception 'Only active collectors may mark their correction notifications as read'
      using errcode = '42501';
  end if;

  insert into public.correction_request_reads (request_id, user_id)
  select cr.id, v_actor
  from public.correction_requests cr
  where cr.requested_by = v_actor
    and cr.status in (
      'resolved'::public.correction_request_status,
      'rejected'::public.correction_request_status
    )
  on conflict (request_id, user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.list_my_correction_requests(integer) from public, anon;
revoke all on function public.count_my_unread_correction_requests() from public, anon;
revoke all on function public.mark_my_correction_requests_read() from public, anon;

grant execute on function public.list_my_correction_requests(integer) to authenticated;
grant execute on function public.count_my_unread_correction_requests() to authenticated;
grant execute on function public.mark_my_correction_requests_read() to authenticated;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'correction_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.correction_requests';
  end if;
end;
$$;
