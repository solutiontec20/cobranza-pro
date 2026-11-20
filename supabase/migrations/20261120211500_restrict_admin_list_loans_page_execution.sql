-- Supabase local databases can grant EXECUTE on new public functions directly
-- to anon through default privileges. Reassert the intended API boundary after
-- every definition of this SECURITY DEFINER RPC.

revoke execute on function public.admin_list_loans_page(
  integer,
  integer,
  text,
  public.loan_status,
  uuid,
  public.loan_frequency
) from public, anon;

grant execute on function public.admin_list_loans_page(
  integer,
  integer,
  text,
  public.loan_status,
  uuid,
  public.loan_frequency
) to authenticated;
