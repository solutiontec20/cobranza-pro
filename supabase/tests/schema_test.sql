begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

-- ============================================================
-- TABLES
-- ============================================================

select has_table(
  'public',
  'profiles',
  'profiles table should exist'
);

select has_table(
  'public',
  'customers',
  'customers table should exist'
);

select has_table(
  'public',
  'loans',
  'loans table should exist'
);

select has_table(
  'public',
  'installments',
  'installments table should exist'
);

select has_table(
  'public',
  'payments',
  'payments table should exist'
);

select has_table(
  'public',
  'payment_allocations',
  'payment_allocations table should exist'
);

select has_table(
  'public',
  'cash_movements',
  'cash_movements table should exist'
);

select has_table(
  'public',
  'cash_closures',
  'cash_closures table should exist'
);

-- ============================================================
-- PRIVATE / AUDIT
-- ============================================================

select has_table(
  'private',
  'audit_log',
  'private.audit_log table should exist'
);

-- ============================================================
-- PRIMARY KEYS
-- ============================================================

select col_is_pk(
  'public',
  'profiles',
  'id',
  'profiles.id should be primary key'
);

select col_is_pk(
  'public',
  'customers',
  'id',
  'customers.id should be primary key'
);

select col_is_pk(
  'public',
  'loans',
  'id',
  'loans.id should be primary key'
);

-- ============================================================
-- IMPORTANT INDEXES
-- ============================================================

select has_index(
  'public',
  'loans',
  'loans_one_active_per_customer_idx',
  'one active loan per customer index should exist'
);

select has_index(
  'public',
  'payments',
  'payments_collector_business_date_idx',
  'payments collector/business-date index should exist'
);

-- ============================================================
-- FINANCIAL RPCs
-- ============================================================

select has_function(
  'public',
  'register_payment',
  array[
    'uuid',
    'numeric',
    'text',
    'timestamp with time zone',
    'text'
  ],
  'register_payment RPC should exist'
);

select has_function(
  'public',
  'void_payment',
  array[
    'uuid',
    'text'
  ],
  'void_payment RPC should exist'
);

select has_function(
  'public',
  'submit_cash_closure',
  array[
    'date',
    'numeric',
    'text'
  ],
  'submit_cash_closure RPC should exist'
);

select has_function(
  'public',
  'validate_cash_closure',
  array[
    'uuid',
    'text'
  ],
  'validate_cash_closure RPC should exist'
);

select * from finish();

rollback;
