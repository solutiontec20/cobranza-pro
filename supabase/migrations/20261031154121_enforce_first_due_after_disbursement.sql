-- ============================================================
-- CENTRAL LOAN DUE-DATE RULES
--
-- The database, not an individual RPC, owns schedule dates. This keeps
-- admin creation/update, collector creation, and renewals aligned without
-- duplicating their financial and authorization logic.
-- ============================================================

create or replace function private.loan_installment_due_on(
  p_started_on date,
  p_frequency public.loan_frequency,
  p_installment_number integer
)
returns date
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_due_date date;
  v_target_month date;
  v_last_day date;
  v_day integer;
  v_step integer;
begin
  if p_installment_number <= 0 then
    raise exception 'Installment number must be greater than zero'
      using errcode = '22023';
  end if;

  if p_frequency = 'daily'::public.loan_frequency then
    v_due_date := p_started_on;

    for v_step in 1..p_installment_number loop
      v_due_date := v_due_date + 1;

      while extract(isodow from v_due_date) = 7 loop
        v_due_date := v_due_date + 1;
      end loop;
    end loop;

    return v_due_date;
  end if;

  if p_frequency = 'weekly'::public.loan_frequency then
    return p_started_on + (p_installment_number * 7);
  end if;

  v_target_month := (
    date_trunc('month', p_started_on)::date
    + make_interval(months => p_installment_number)
  )::date;
  v_last_day := (v_target_month + interval '1 month - 1 day')::date;
  v_day := least(
    extract(day from p_started_on)::integer,
    extract(day from v_last_day)::integer
  );
  v_due_date := v_target_month + (v_day - 1);

  if extract(isodow from v_due_date) = 7 then
    if date_trunc('month', v_due_date + 1) = date_trunc('month', v_due_date) then
      v_due_date := v_due_date + 1;
    else
      v_due_date := v_due_date - 1;
    end if;
  end if;

  return v_due_date;
end;
$$;


create or replace function private.loan_first_due_on(
  p_started_on date,
  p_frequency public.loan_frequency
)
returns date
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select private.loan_installment_due_on(p_started_on, p_frequency, 1);
$$;


create or replace function private.repair_active_loan_due_dates()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_loan record;
  v_installment record;
  v_repaired integer := 0;
begin
  perform set_config(
    'app.audit_reason',
    'Automatic repair: first installment must follow disbursement',
    true
  );

  for v_loan in
    select l.id, l.started_on, l.frequency
    from public.loans l
    where l.status = 'active'::public.loan_status
    order by l.id
    for update
  loop
    if (
      select l.first_due_on
      from public.loans l
      where l.id = v_loan.id
    ) is distinct from private.loan_first_due_on(v_loan.started_on, v_loan.frequency)
    then
      update public.loans l
      set first_due_on = private.loan_first_due_on(v_loan.started_on, v_loan.frequency)
      where l.id = v_loan.id;

      v_repaired := v_repaired + 1;
    end if;

    -- Descending order frees each later date before the previous installment
    -- moves into it, preserving the active unique due-date index throughout.
    for v_installment in
      select i.id, i.installment_number
      from public.installments i
      where i.loan_id = v_loan.id
        and i.superseded_at is null
        and i.due_date is distinct from private.loan_installment_due_on(
          v_loan.started_on,
          v_loan.frequency,
          i.installment_number
        )
      order by i.installment_number desc
      for update
    loop
      update public.installments i
      set due_date = private.loan_installment_due_on(
        v_loan.started_on,
        v_loan.frequency,
        v_installment.installment_number
      )
      where i.id = v_installment.id;

      v_repaired := v_repaired + 1;
    end loop;
  end loop;

  return v_repaired;
end;
$$;


create or replace function private.enforce_loan_first_due_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.first_due_on := private.loan_first_due_on(new.started_on, new.frequency);
  return new;
end;
$$;


create or replace function private.enforce_installment_due_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started_on date;
  v_frequency public.loan_frequency;
begin
  select l.started_on, l.frequency
  into v_started_on, v_frequency
  from public.loans l
  where l.id = new.loan_id;

  if not found then
    raise exception 'Loan not found for installment'
      using errcode = '23503';
  end if;

  new.due_date := private.loan_installment_due_on(
    v_started_on,
    v_frequency,
    new.installment_number
  );

  return new;
end;
$$;


-- Repair first, then enable the permanent boundary for every current and
-- future RPC path. Existing row IDs, amounts, payments, and allocations stay
-- untouched; normal audit triggers record only changed loan/installment rows.
select private.repair_active_loan_due_dates();

drop trigger if exists loans_enforce_first_due_on on public.loans;
create trigger loans_enforce_first_due_on
before insert or update of started_on, frequency, first_due_on
on public.loans
for each row
execute function private.enforce_loan_first_due_on();

drop trigger if exists installments_enforce_due_on on public.installments;
create trigger installments_enforce_due_on
before insert or update of loan_id, installment_number, due_date
on public.installments
for each row
execute function private.enforce_installment_due_on();


revoke execute
on function private.loan_installment_due_on(date, public.loan_frequency, integer)
from public, anon, authenticated;

revoke execute
on function private.loan_first_due_on(date, public.loan_frequency)
from public, anon, authenticated;

revoke execute
on function private.repair_active_loan_due_dates()
from public, anon, authenticated;

revoke execute
on function private.enforce_loan_first_due_on()
from public, anon, authenticated;

revoke execute
on function private.enforce_installment_due_on()
from public, anon, authenticated;
