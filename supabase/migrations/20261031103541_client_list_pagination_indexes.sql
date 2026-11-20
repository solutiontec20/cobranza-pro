-- Support stable server-side pagination for the administrative customer list.
-- The second index keeps collector-filtered pages ordered without sorting the whole portfolio.

create index if not exists customers_created_id_idx
  on public.customers (created_at desc, id desc);

create index if not exists customers_collector_created_id_idx
  on public.customers (collector_id, created_at desc, id desc);
