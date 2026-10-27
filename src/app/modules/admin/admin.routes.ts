import { Routes } from '@angular/router';
import { SupabaseAdminDashboardRepository } from '../../core/adapters/supabase-admin-dashboard.repository';
import { SupabaseCashClosureRepository } from '../../core/adapters/supabase-cash-closure.repository';
import { SupabaseClientRepository } from '../../core/adapters/supabase-client.repository';
import { SupabaseCollectorRepository } from '../../core/adapters/supabase-collector.repository';
import { SupabaseDailyControlRepository } from '../../core/adapters/supabase-daily-control.repository';
import { SupabaseLoanRepository } from '../../core/adapters/supabase-loan.repository';
import { ADMIN_DASHBOARD_REPOSITORY } from '../../core/repositories/admin-dashboard.repository';
import { CASH_CLOSURE_REPOSITORY } from '../../core/repositories/cash-closure.repository';
import { CLIENT_REPOSITORY } from '../../core/repositories/client.repository';
import { COLLECTOR_REPOSITORY } from '../../core/repositories/collector.repository';
import { DAILY_CONTROL_REPOSITORY } from '../../core/repositories/daily-control.repository';
import { LOAN_REPOSITORY } from '../../core/repositories/loan.repository';
import { AdminDashboardStore } from './dashboard/admin-dashboard.store';
import { CashClosureStore } from './cash-closure/cash-closure.store';
import { ClientsStore } from './clients/clients.store';
import { CollectorsStore } from './collectors/collectors.store';
import { DailyControlExportService } from './daily-control/daily-control-export.service';
import { DailyControlStore } from './daily-control/daily-control.store';
import { LoansStore } from './loans/loans.store';

export const ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard'),
    providers: [
      AdminDashboardStore,
      { provide: ADMIN_DASHBOARD_REPOSITORY, useClass: SupabaseAdminDashboardRepository },
    ],
  },
  {
    path: 'clientes',
    loadComponent: () => import('./clients/clients'),
    providers: [
      ClientsStore,
      { provide: CLIENT_REPOSITORY, useClass: SupabaseClientRepository },
    ],
  },
  {
    path: 'prestamos',
    providers: [
      LoansStore,
      { provide: LOAN_REPOSITORY, useClass: SupabaseLoanRepository },
    ],
    children: [
      {
        path: '',
        title: 'Préstamos | CobranzaPro',
        loadComponent: () => import('./loans/loans'),
      },
      {
        path: ':loanId',
        title: 'Detalle del préstamo | CobranzaPro',
        loadComponent: () => import('./loans/loan-detail/loan-detail'),
      },
    ],
  },
  {
    path: 'cobradores',
    loadComponent: () => import('./collectors/collectors'),
    providers: [
      CollectorsStore,
      { provide: COLLECTOR_REPOSITORY, useClass: SupabaseCollectorRepository },
    ],
  },
  {
    path: 'control-diario',
    title: 'Control diario | CobranzaPro',
    loadComponent: () => import('./daily-control/daily-control'),
    providers: [
      DailyControlStore,
      DailyControlExportService,
      { provide: DAILY_CONTROL_REPOSITORY, useClass: SupabaseDailyControlRepository },
    ],
  },
  {
    path: 'cierre-caja',
    title: 'Cierre de caja | CobranzaPro',
    loadComponent: () => import('./cash-closure/cash-closure'),
    providers: [
      CashClosureStore,
      { provide: CASH_CLOSURE_REPOSITORY, useClass: SupabaseCashClosureRepository },
    ],
  },
  { path: 'auditoria', loadComponent: () => import('./audit/audit') },
];

