-- ============================================================
-- COBRANZAPRO - REPAIR ACTIVE DAILY SCHEDULES
-- ============================================================
-- Daily collections run Monday through Saturday. Public holidays
-- remain collection days; Sunday is the only excluded weekday.
--
-- The previous generator correction applied only to new or replaced
-- schedules. This migration repairs legacy active schedules in place
-- so installment identities, amounts, payments, allocations, and
-- superseded history remain intact. Existing audit triggers record
-- every due-date correction.
-- ============================================================

create or replace function private.repair_active_daily_loan_schedules()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_loan record;
  v_installment record;
  v_correct_due_date date;
  v_legacy_due_date date;
  v_active_count integer;
  v_matches_correct_schedule boolean;
  v_matches_legacy_schedule boolean;
  v_repaired_loans integer := 0;
begin
  perform set_config(
    'app.audit_reason',
    'Correct daily schedule to collect Monday through Saturday',
    true
  );

  for v_loan in
    select
      l.id,
      l.first_due_on,
      l.installment_count
    from public.loans l
    where l.status = 'active'::public.loan_status
      and l.frequency = 'daily'::public.loan_frequency
    order by l.id
    for update
  loop
    select count(*)::integer
    into v_active_count
    from public.installments i
    where i.loan_id = v_loan.id
      and i.superseded_at is null;

    if v_active_count <> v_loan.installment_count then
      raise exception
        'Cannot repair loan %: active installment count is inconsistent',
        v_loan.id
        using errcode = '22023';
    end if;

    v_correct_due_date := v_loan.first_due_on;
    while extract(isodow from v_correct_due_date) = 7
    loop
      v_correct_due_date := v_correct_due_date + 1;
    end loop;

    v_legacy_due_date := v_correct_due_date;
    v_matches_correct_schedule := true;
    v_matches_legacy_schedule := true;

    for v_installment in
      select
        i.id,
        i.installment_number,
        i.due_date
      from public.installments i
      where i.loan_id = v_loan.id
        and i.superseded_at is null
      order by i.installment_number
      for update
    loop
      v_matches_correct_schedule :=
        v_matches_correct_schedule
        and v_installment.due_date = v_correct_due_date;

      v_matches_legacy_schedule :=
        v_matches_legacy_schedule
        and v_installment.due_date = v_legacy_due_date;

      v_correct_due_date := v_correct_due_date + 1;
      while extract(isodow from v_correct_due_date) = 7
      loop
        v_correct_due_date := v_correct_due_date + 1;
      end loop;

      v_legacy_due_date := v_legacy_due_date + 1;
      while extract(isodow from v_legacy_due_date) in (6, 7)
      loop
        v_legacy_due_date := v_legacy_due_date + 1;
      end loop;
    end loop;

    if v_matches_correct_schedule then
      continue;
    end if;

    if not v_matches_legacy_schedule then
      raise exception
        'Cannot repair loan %: active daily schedule is neither legacy nor current',
        v_loan.id
        using errcode = '22023';
    end if;

    v_correct_due_date := v_loan.first_due_on;
    while extract(isodow from v_correct_due_date) = 7
    loop
      v_correct_due_date := v_correct_due_date + 1;
    end loop;

    for v_installment in
      select
        i.id,
        i.installment_number,
        i.due_date
      from public.installments i
      where i.loan_id = v_loan.id
        and i.superseded_at is null
      order by i.installment_number
      for update
    loop
      if v_installment.due_date <> v_correct_due_date then
        update public.installments
        set due_date = v_correct_due_date
        where id = v_installment.id;
      end if;

      v_correct_due_date := v_correct_due_date + 1;
      while extract(isodow from v_correct_due_date) = 7
      loop
        v_correct_due_date := v_correct_due_date + 1;
      end loop;
    end loop;

    v_repaired_loans := v_repaired_loans + 1;
  end loop;

  return v_repaired_loans;
end;
$$;

revoke all
  on function private.repair_active_daily_loan_schedules()
  from public, anon, authenticated;

comment on function private.repair_active_daily_loan_schedules()
is 'Repairs legacy active daily schedules in place so only Sundays are skipped.';

select private.repair_active_daily_loan_schedules();
