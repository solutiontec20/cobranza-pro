import { Routes } from '@angular/router';
import { SupabaseCollectorPortfolioRepository } from '../../core/adapters/supabase-collector-portfolio.repository';
import { SupabaseLoanRepository } from '../../core/adapters/supabase-loan.repository';
import { COLLECTOR_PORTFOLIO_REPOSITORY } from '../../core/repositories/collector-portfolio.repository';
import { LOAN_REPOSITORY } from '../../core/repositories/loan.repository';
import { CollectorLoanStore } from './client-detail/collector-loan.store';
import { CollectionDashboardStore } from './collection-dashboard.store';

export const COLLECTOR_ROUTES: Routes = [
  {
    path: '',
    providers: [
      CollectionDashboardStore,
      { provide: COLLECTOR_PORTFOLIO_REPOSITORY, useClass: SupabaseCollectorPortfolioRepository },
      CollectorLoanStore,
      { provide: LOAN_REPOSITORY, useClass: SupabaseLoanRepository },
    ],
    children: [
      {
        path: '',
        loadComponent: () => import('./dashboard/dashboard'),
        title: 'Cobranza de hoy | CobranzaPro',
      },
      {
        path: 'clientes',
        loadComponent: () => import('./clients/clients'),
        title: 'Mis Clientes | CobranzaPro',
      },
      {
        path: 'cliente/:id',
        loadComponent: () => import('./client-detail/client-detail'),
        title: 'Detalle de Cliente | CobranzaPro',
      },
      {
        path: ':id',
        loadComponent: () => import('./client-detail/client-detail'),
        title: 'Detalle de Cliente | CobranzaPro',
      },
    ],
  },
];
