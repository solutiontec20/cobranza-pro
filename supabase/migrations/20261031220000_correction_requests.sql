-- Persisted correction requests keep collectors away from direct financial mutations.

create type public.correction_request_type as enum (
  'edit_loan',
  'void_loan',
  'void_payment'
);

create type public.correction_request_status as enum (
  'pending',
  'resolved',
  'rejected'
);

create table public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  request_type public.correction_request_type not null,
  status public.correction_request_status not null default 'pending',
  loan_id uuid not null references public.loans(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  proposed_changes jsonb,
  handled_by uuid references public.profiles(id) on delete restrict,
  handled_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint correction_requests_reason_chk
    check (char_length(btrim(reason)) between 5 and 1000),
  constraint correction_requests_target_chk
    check (
      (request_type = 'void_payment' and payment_id is not null)
      or
      (request_type in ('edit_loan', 'void_loan') and payment_id is null)
    ),
  constraint correction_requests_proposed_changes_chk
    check (
      proposed_changes is null
      or (
        request_type = 'edit_loan'
        and jsonb_typeof(proposed_changes) = 'object'
      )
    ),
  constraint correction_requests_lifecycle_chk
    check (
      (
        status = 'pending'
        and handled_by is null
        and handled_at is null
        and resolution_note is null
      )
      or
      (
        status in ('resolved', 'rejected')
        and handled_by is not null
        and handled_at is not null
        and char_length(btrim(resolution_note)) between 5 and 1000
      )
    )
);

create index correction_requests_status_created_idx
  on public.correction_requests (status, created_at desc, id desc);

create index correction_requests_requested_by_created_idx
  on public.correction_requests (requested_by, created_at desc);

create index correction_requests_loan_created_idx
  on public.correction_requests (loan_id, created_at desc);

create unique index correction_requests_pending_loan_unique_idx
  on public.correction_requests (requested_by, request_type, loan_id)
  where status = 'pending' and payment_id is null;

create unique index correction_requests_pending_payment_unique_idx
  on public.correction_requests (requested_by, request_type, payment_id)
  where status = 'pending' and payment_id is not null;

alter table public.correction_requests enable row level security;

create policy correction_requests_select
on public.correction_requests
for select
to authenticated
using (
  (select private.current_app_role()) in (
    'admin'::public.app_role,
    'supervisor'::public.app_role
  )
  or (
    (select private.current_app_role()) = 'collector'::public.app_role
    and requested_by = (select auth.uid())
  )
);

revoke all on table public.correction_requests from public, anon, authenticated;
grant select on table public.correction_requests to authenticated;

create trigger correction_requests_touch_updated_at
before update on public.correction_requests
for each row execute function private.touch_updated_at();

create trigger correction_requests_audit_update
after update on public.correction_requests
for each row execute function private.audit_update();

create trigger correction_requests_prevent_delete
before delete on public.correction_requests
for each row execute function private.prevent_delete();

create or replace function private.require_correction_request_reviewer()
returns uuid
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
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select private.current_app_role() into v_role;

  if v_role is null
    or v_role not in ('admin'::public.app_role, 'supervisor'::public.app_role)
  then
    raise exception 'Only administrators or supervisors may review correction requests'
      using errcode = '42501';
  end if;

  return v_actor;
end;
$$;

create or replace function private.lock_pending_correction_request(
  p_request_id uuid,
  p_expected_type public.correction_request_type
)
returns public.correction_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_request public.correction_requests%rowtype;
begin
  select cr.* into v_request
  from public.correction_requests cr
  where cr.id = p_request_id
  for update;

  if not found then
    raise exception 'Correction request not found' using errcode = '22023';
  end if;

  if v_request.request_type <> p_expected_type then
    raise exception 'Correction request type does not match this action'
      using errcode = '22023';
  end if;

  if v_request.status <> 'pending'::public.correction_request_status then
    raise exception 'Correction request has already been handled'
      using errcode = '22023';
  end if;

  return v_request;
end;
$$;

revoke all on function private.require_correction_request_reviewer()
  from public, anon, authenticated;
revoke all on function private.lock_pending_correction_request(uuid, public.correction_request_type)
  from public, anon, authenticated;

create or replace function public.create_correction_request(
  p_request_type public.correction_request_type,
  p_loan_id uuid,
  p_reason text,
  p_payment_id uuid default null,
  p_proposed_changes jsonb default null
)
returns table (
  request_id uuid,
  request_type public.correction_request_type,
  request_status public.correction_request_status,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_loan_status public.loan_status;
  v_payment_status public.payment_status;
  v_created public.correction_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select private.current_app_role() into v_role;

  if v_role is distinct from 'collector'::public.app_role then
    raise exception 'Only active collectors may create correction requests'
      using errcode = '42501';
  end if;

  if p_request_type is null or p_loan_id is null then
    raise exception 'Correction request type and loan are required'
      using errcode = '22023';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then
    raise exception 'Correction request reason must contain between 5 and 1000 characters'
      using errcode = '22023';
  end if;

  select l.status into v_loan_status
  from public.loans l
  join public.customers c on c.id = l.customer_id
  where l.id = p_loan_id
    and c.collector_id = v_actor;

  if not found then
    raise exception 'Loan does not belong to the collector portfolio'
      using errcode = '42501';
  end if;

  if p_request_type in ('edit_loan', 'void_loan')
    and v_loan_status <> 'active'::public.loan_status
  then
    raise exception 'Only active loans may be edited or voided'
      using errcode = '22023';
  end if;

  if p_request_type = 'void_payment'::public.correction_request_type then
    if p_payment_id is null then
      raise exception 'Payment is required for a payment void request'
        using errcode = '22023';
    end if;

    select p.status into v_payment_status
    from public.payments p
    where p.id = p_payment_id
      and p.loan_id = p_loan_id;

    if not found then
      raise exception 'Payment does not belong to the requested loan'
        using errcode = '22023';
    end if;

    if v_payment_status <> 'posted'::public.payment_status then
      raise exception 'Only posted payments may be requested for voiding'
        using errcode = '22023';
    end if;

    if v_loan_status in ('renewed'::public.loan_status, 'voided'::public.loan_status) then
      raise exception 'Payments on renewed or voided loans cannot be voided directly'
        using errcode = '22023';
    end if;

    if p_proposed_changes is not null then
      raise exception 'Payment void requests cannot contain proposed loan changes'
        using errcode = '22023';
    end if;
  elsif p_payment_id is not null then
    raise exception 'Payment is only valid for a payment void request'
      using errcode = '22023';
  end if;

  if p_proposed_changes is not null and (
    p_request_type <> 'edit_loan'::public.correction_request_type
    or jsonb_typeof(p_proposed_changes) <> 'object'
  ) then
    raise exception 'Proposed changes must be an object for an edit loan request'
      using errcode = '22023';
  end if;

  begin
    insert into public.correction_requests (
      request_type,
      loan_id,
      payment_id,
      requested_by,
      reason,
      proposed_changes
    ) values (
      p_request_type,
      p_loan_id,
      p_payment_id,
      v_actor,
      btrim(p_reason),
      p_proposed_changes
    )
    returning * into v_created;
  exception
    when unique_violation then
      raise exception 'A pending correction request already exists for this record and action'
        using errcode = '23505';
  end;

  return query
  select v_created.id, v_created.request_type, v_created.status, v_created.created_at;
end;
$$;

create or replace function public.list_correction_requests(
  p_status public.correction_request_status default null,
  p_limit integer default 100
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
  payment_method text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_correction_request_reviewer();

  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'Request list limit must be between 1 and 200'
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
    p.payment_method
  from public.correction_requests cr
  join public.loans l on l.id = cr.loan_id
  join public.customers c on c.id = l.customer_id
  join public.profiles collector on collector.id = c.collector_id
  left join public.payments p on p.id = cr.payment_id
  where p_status is null or cr.status = p_status
  order by cr.created_at desc, cr.id desc
  limit p_limit;
end;
$$;

create or replace function public.count_pending_correction_requests()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  perform private.require_correction_request_reviewer();

  select count(*) into v_count
  from public.correction_requests cr
  where cr.status = 'pending'::public.correction_request_status;

  return v_count;
end;
$$;

create or replace function public.reject_correction_request(
  p_request_id uuid,
  p_resolution_note text
)
returns table (
  id uuid,
  status public.correction_request_status,
  handled_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request public.correction_requests%rowtype;
begin
  v_actor := private.require_correction_request_reviewer();

  if p_resolution_note is null
    or char_length(btrim(p_resolution_note)) not between 5 and 1000
  then
    raise exception 'Resolution note must contain between 5 and 1000 characters'
      using errcode = '22023';
  end if;

  select cr.* into v_request
  from public.correction_requests cr
  where cr.id = p_request_id
  for update;

  if not found then
    raise exception 'Correction request not found' using errcode = '22023';
  end if;

  if v_request.status <> 'pending'::public.correction_request_status then
    raise exception 'Correction request has already been handled'
      using errcode = '22023';
  end if;

  perform set_config('app.audit_reason', btrim(p_resolution_note), true);

  return query
  update public.correction_requests cr
  set
    status = 'rejected'::public.correction_request_status,
    handled_by = v_actor,
    handled_at = now(),
    resolution_note = btrim(p_resolution_note)
  where cr.id = p_request_id
  returning cr.id, cr.status, cr.handled_at;
end;
$$;

create or replace function public.resolve_edit_loan_request(
  p_request_id uuid,
  p_principal numeric,
  p_interest_rate numeric,
  p_frequency public.loan_frequency,
  p_installment_count integer,
  p_started_on date,
  p_reason text
)
returns table (
  id uuid,
  status public.correction_request_status,
  handled_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request public.correction_requests%rowtype;
begin
  v_actor := private.require_correction_request_reviewer();

  if p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then
    raise exception 'Resolution reason must contain between 5 and 1000 characters'
      using errcode = '22023';
  end if;

  v_request := private.lock_pending_correction_request(
    p_request_id,
    'edit_loan'::public.correction_request_type
  );

  perform public.admin_update_loan(
    v_request.loan_id,
    p_principal,
    p_interest_rate,
    p_frequency,
    p_installment_count,
    p_started_on,
    btrim(p_reason)
  );

  perform set_config('app.audit_reason', btrim(p_reason), true);

  return query
  update public.correction_requests cr
  set
    status = 'resolved'::public.correction_request_status,
    handled_by = v_actor,
    handled_at = now(),
    resolution_note = btrim(p_reason)
  where cr.id = p_request_id
  returning cr.id, cr.status, cr.handled_at;
end;
$$;

create or replace function public.resolve_void_payment_request(
  p_request_id uuid,
  p_resolution_note text
)
returns table (
  id uuid,
  status public.correction_request_status,
  handled_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request public.correction_requests%rowtype;
begin
  v_actor := private.require_correction_request_reviewer();

  if p_resolution_note is null
    or char_length(btrim(p_resolution_note)) not between 5 and 1000
  then
    raise exception 'Resolution note must contain between 5 and 1000 characters'
      using errcode = '22023';
  end if;

  v_request := private.lock_pending_correction_request(
    p_request_id,
    'void_payment'::public.correction_request_type
  );

  perform public.void_payment(v_request.payment_id, btrim(p_resolution_note));

  perform set_config('app.audit_reason', btrim(p_resolution_note), true);

  return query
  update public.correction_requests cr
  set
    status = 'resolved'::public.correction_request_status,
    handled_by = v_actor,
    handled_at = now(),
    resolution_note = btrim(p_resolution_note)
  where cr.id = p_request_id
  returning cr.id, cr.status, cr.handled_at;
end;
$$;

create or replace function public.resolve_void_loan_request(
  p_request_id uuid,
  p_resolution_note text
)
returns table (
  id uuid,
  status public.correction_request_status,
  handled_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_request public.correction_requests%rowtype;
  v_loan_status public.loan_status;
  v_customer_id uuid;
  v_disbursed_amount numeric(12,2);
  v_movement_id uuid;
  v_movement_collector_id uuid;
  v_movement_amount numeric(12,2);
  v_movement_count integer;
begin
  v_actor := private.require_correction_request_reviewer();

  if p_resolution_note is null
    or char_length(btrim(p_resolution_note)) not between 5 and 1000
  then
    raise exception 'Resolution note must contain between 5 and 1000 characters'
      using errcode = '22023';
  end if;

  v_request := private.lock_pending_correction_request(
    p_request_id,
    'void_loan'::public.correction_request_type
  );

  select l.status, l.customer_id, l.disbursed_amount
  into v_loan_status, v_customer_id, v_disbursed_amount
  from public.loans l
  where l.id = v_request.loan_id
  for update;

  if not found then
    raise exception 'Loan not found' using errcode = '22023';
  end if;

  if v_loan_status <> 'active'::public.loan_status then
    raise exception 'Only active loans may be voided' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.payments p
    where p.loan_id = v_request.loan_id
      and p.status = 'posted'::public.payment_status
  ) then
    raise exception 'Loans with posted payments cannot be voided'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_movement_count
  from public.cash_movements cm
  where cm.loan_id = v_request.loan_id
    and cm.direction = 'outflow'::public.cash_direction
    and cm.movement_type = 'loan_disbursement';

  if v_disbursed_amount > 0 and v_movement_count <> 1 then
    raise exception 'Loan disbursement cash movement is inconsistent'
      using errcode = '22023';
  end if;

  if v_disbursed_amount = 0 and v_movement_count <> 0 then
    raise exception 'Zero-disbursement loan has an inconsistent cash movement'
      using errcode = '22023';
  end if;

  if v_movement_count = 1 then
    select cm.id, cm.collector_id, cm.amount
    into v_movement_id, v_movement_collector_id, v_movement_amount
    from public.cash_movements cm
    where cm.loan_id = v_request.loan_id
      and cm.direction = 'outflow'::public.cash_direction
      and cm.movement_type = 'loan_disbursement'
    for update;

    if exists (
      select 1 from public.cash_movements reversal
      where reversal.reversal_of_id = v_movement_id
    ) then
      raise exception 'Loan disbursement has already been reversed'
        using errcode = '22023';
    end if;
  end if;

  perform set_config('app.audit_reason', btrim(p_resolution_note), true);

  update public.installments
  set
    superseded_at = now(),
    superseded_by = v_actor,
    supersession_reason = btrim(p_resolution_note)
  where loan_id = v_request.loan_id
    and superseded_at is null;

  update public.loans l
  set
    status = 'voided'::public.loan_status,
    closed_at = now(),
    close_reason = btrim(p_resolution_note)
  where l.id = v_request.loan_id;

  if v_movement_id is not null then
    insert into public.cash_movements (
      collector_id,
      customer_id,
      loan_id,
      payment_id,
      reversal_of_id,
      direction,
      movement_type,
      amount,
      payment_method,
      occurred_at,
      business_date,
      notes,
      created_by
    ) values (
      v_movement_collector_id,
      v_customer_id,
      v_request.loan_id,
      null,
      v_movement_id,
      'inflow'::public.cash_direction,
      'loan_void',
      v_movement_amount,
      null,
      now(),
      (now() at time zone 'America/Lima')::date,
      btrim(p_resolution_note),
      v_actor
    );
  end if;

  return query
  update public.correction_requests cr
  set
    status = 'resolved'::public.correction_request_status,
    handled_by = v_actor,
    handled_at = now(),
    resolution_note = btrim(p_resolution_note)
  where cr.id = p_request_id
  returning cr.id, cr.status, cr.handled_at;
end;
$$;

revoke all on function public.create_correction_request(
  public.correction_request_type, uuid, text, uuid, jsonb
) from public, anon;
revoke all on function public.list_correction_requests(
  public.correction_request_status, integer
) from public, anon;
revoke all on function public.count_pending_correction_requests() from public, anon;
revoke all on function public.reject_correction_request(uuid, text) from public, anon;
revoke all on function public.resolve_edit_loan_request(
  uuid, numeric, numeric, public.loan_frequency, integer, date, text
) from public, anon;
revoke all on function public.resolve_void_payment_request(uuid, text) from public, anon;
revoke all on function public.resolve_void_loan_request(uuid, text) from public, anon;

grant execute on function public.create_correction_request(
  public.correction_request_type, uuid, text, uuid, jsonb
) to authenticated;
grant execute on function public.list_correction_requests(
  public.correction_request_status, integer
) to authenticated;
grant execute on function public.count_pending_correction_requests() to authenticated;
grant execute on function public.reject_correction_request(uuid, text) to authenticated;
grant execute on function public.resolve_edit_loan_request(
  uuid, numeric, numeric, public.loan_frequency, integer, date, text
) to authenticated;
grant execute on function public.resolve_void_payment_request(uuid, text) to authenticated;
grant execute on function public.resolve_void_loan_request(uuid, text) to authenticated;
