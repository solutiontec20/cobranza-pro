import { Routes } from '@angular/router';
import { SupabaseClientRepository } from '../../core/adapters/supabase-client.repository';
import { SupabaseCollectorRepository } from '../../core/adapters/supabase-collector.repository';
import { SupabaseLoanRepository } from '../../core/adapters/supabase-loan.repository';
import { CLIENT_REPOSITORY } from '../../core/repositories/client.repository';
import { COLLECTOR_REPOSITORY } from '../../core/repositories/collector.repository';
import { LOAN_REPOSITORY } from '../../core/repositories/loan.repository';
import { ClientsStore } from './clients/clients.store';
import { CollectorsStore } from './collectors/collectors.store';
import { LoansStore } from './loans/loans.store';

export const ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard') },
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
    loadComponent: () => import('./loans/loans'),
    providers: [
      LoansStore,
      { provide: LOAN_REPOSITORY, useClass: SupabaseLoanRepository },
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
  { path: 'control-diario', loadComponent: () => import('./daily-control/daily-control') },
  { path: 'auditoria', loadComponent: () => import('./audit/audit') },
];
