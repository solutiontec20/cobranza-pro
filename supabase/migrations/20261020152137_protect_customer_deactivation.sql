-- A customer with an active loan must remain visible in the operating portfolio.
-- Customer updates already acquire a row lock. admin_create_loan locks the same
-- customer row, so loan creation and deactivation are serialized.
create or replace function private.protect_customer_deactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active = true
     and new.active = false
     and exists (
       select 1
       from public.loans l
       where l.customer_id = old.id
         and l.status = 'active'::public.loan_status
     )
  then
    raise exception 'CUSTOMER_HAS_ACTIVE_LOAN'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_protect_deactivation on public.customers;

create trigger customers_protect_deactivation
before update of active
on public.customers
for each row
execute function private.protect_customer_deactivation();

revoke execute
on function private.protect_customer_deactivation()
from public, anon, authenticated;
