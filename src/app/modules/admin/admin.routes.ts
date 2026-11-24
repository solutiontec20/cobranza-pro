import { Routes } from '@angular/router';
import { SupabaseAdminDashboardRepository } from '../../core/adapters/supabase-admin-dashboard.repository';
import { SupabaseAnalyticsRepository } from '../../core/adapters/supabase-analytics.repository';
import { SupabaseCashClosureRepository } from '../../core/adapters/supabase-cash-closure.repository';
import { SupabaseClientRepository } from '../../core/adapters/supabase-client.repository';
import { SupabaseCollectorRepository } from '../../core/adapters/supabase-collector.repository';
import { SupabaseDailyControlRepository } from '../../core/adapters/supabase-daily-control.repository';
import { SupabaseLoanRepository } from '../../core/adapters/supabase-loan.repository';
import { SupabaseAccessControlRepository } from '../../core/adapters/supabase-access-control.repository';
import { permissionCanMatch } from '../auth/auth.guard';
import { ADMIN_DASHBOARD_REPOSITORY } from '../../core/repositories/admin-dashboard.repository';
import { ANALYTICS_REPOSITORY } from '../../core/repositories/analytics.repository';
import { CASH_CLOSURE_REPOSITORY } from '../../core/repositories/cash-closure.repository';
import { CLIENT_REPOSITORY } from '../../core/repositories/client.repository';
import { COLLECTOR_REPOSITORY } from '../../core/repositories/collector.repository';
import { DAILY_CONTROL_REPOSITORY } from '../../core/repositories/daily-control.repository';
import { LOAN_REPOSITORY } from '../../core/repositories/loan.repository';
import { ACCESS_CONTROL_REPOSITORY } from '../../core/repositories/access-control.repository';
import { AdminDashboardStore } from './dashboard/admin-dashboard.store';
import { AnalyticsStore } from './analytics/analytics.store';
import { CashClosureStore } from './cash-closure/cash-closure.store';
import { ClientsStore } from './clients/clients.store';
import { CollectorsStore } from './collectors/collectors.store';
import { DailyControlExportService } from './daily-control/daily-control-export.service';
import { DailyControlStore } from './daily-control/daily-control.store';
import { LoansStore } from './loans/loans.store';
import { AccessControlStore } from './access-control/access-control.store';

export const ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'sin-acceso',
    title: 'Sin acceso | CobranzaPro',
    loadComponent: () => import('./access-denied/access-denied'),
  },
  {
    path: 'dashboard',
    canMatch: [permissionCanMatch],
    data: { permission: 'dashboard.view' },
    loadComponent: () => import('./dashboard/dashboard'),
    providers: [
      AdminDashboardStore,
      { provide: ADMIN_DASHBOARD_REPOSITORY, useClass: SupabaseAdminDashboardRepository },
    ],
  },
  {
    path: 'analiticas',
    title: 'Analíticas | CobranzaPro',
    canMatch: [permissionCanMatch],
    data: { permission: 'analytics.view' },
    loadComponent: () => import('./analytics/analytics'),
    providers: [
      AnalyticsStore,
      { provide: ANALYTICS_REPOSITORY, useClass: SupabaseAnalyticsRepository },
    ],
  },
  {
    path: 'clientes',
    canMatch: [permissionCanMatch],
    data: { permission: 'clients.view' },
    loadComponent: () => import('./clients/clients'),
    providers: [ClientsStore, { provide: CLIENT_REPOSITORY, useClass: SupabaseClientRepository }],
  },
  {
    path: 'prestamos',
    canMatch: [permissionCanMatch],
    data: { permission: 'loans.view' },
    providers: [LoansStore, { provide: LOAN_REPOSITORY, useClass: SupabaseLoanRepository }],
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
    canMatch: [permissionCanMatch],
    data: { permission: 'collectors.view' },
    loadComponent: () => import('./collectors/collectors'),
    providers: [
      CollectorsStore,
      { provide: COLLECTOR_REPOSITORY, useClass: SupabaseCollectorRepository },
    ],
  },
  {
    path: 'control-diario',
    title: 'Control diario | CobranzaPro',
    canMatch: [permissionCanMatch],
    data: { permission: 'daily_control.view' },
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
    canMatch: [permissionCanMatch],
    data: { permission: 'cash_closure.view' },
    loadComponent: () => import('./cash-closure/cash-closure'),
    providers: [
      CashClosureStore,
      { provide: CASH_CLOSURE_REPOSITORY, useClass: SupabaseCashClosureRepository },
    ],
  },
  {
    path: 'solicitudes',
    title: 'Solicitudes de corrección | CobranzaPro',
    canMatch: [permissionCanMatch],
    data: { permission: 'correction_requests.view' },
    loadComponent: () => import('./correction-requests/correction-requests'),
  },
  {
    path: 'roles',
    title: 'Roles y permisos | CobranzaPro',
    canMatch: [permissionCanMatch],
    data: { permission: 'roles.view' },
    loadComponent: () => import('./access-control/access-control'),
    providers: [
      AccessControlStore,
      { provide: ACCESS_CONTROL_REPOSITORY, useClass: SupabaseAccessControlRepository },
    ],
  },
  {
    path: 'auditoria',
    canMatch: [permissionCanMatch],
    data: { permission: 'audit.view' },
    loadComponent: () => import('./audit/audit'),
  },
];
