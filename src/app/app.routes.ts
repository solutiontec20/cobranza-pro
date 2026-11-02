import { Routes } from '@angular/router';
import { SupabaseCorrectionRequestRepository } from './core/adapters/supabase-correction-request.repository';
import { CORRECTION_REQUEST_REPOSITORY } from './core/repositories/correction-request.repository';
import {
  adminAreaGuard,
  authGuard,
  collectorAreaGuard,
  operationalGuard,
  publicGuard,
} from './modules/auth/auth.guard';
import { CorrectionRequestsStore } from './modules/correction-requests/correction-requests.store';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [publicGuard],
    loadChildren: () => import('./modules/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    loadComponent: () => import('./shell/app-shell'),
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    providers: [
      CorrectionRequestsStore,
      {
        provide: CORRECTION_REQUEST_REPOSITORY,
        useClass: SupabaseCorrectionRequestRepository,
      },
    ],
    children: [
      {
        path: 'cambiar-pin',
        loadComponent: () => import('./modules/auth/change-pin/change-pin'),
        title: 'Cambiar PIN | CobranzaPro',
      },
      // Collector routes
      {
        path: 'cobrador',
        canActivate: [operationalGuard, collectorAreaGuard],
        loadChildren: () =>
          import('./modules/collector/collector.routes').then((m) => m.COLLECTOR_ROUTES),
      },
      // Admin routes
      {
        path: 'admin',
        canActivate: [operationalGuard, adminAreaGuard],
        loadChildren: () => import('./modules/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
      // Redirects
      { path: 'dashboard', redirectTo: 'cobrador', pathMatch: 'full' },
      { path: 'clientes', redirectTo: 'admin/clientes', pathMatch: 'full' },
      { path: 'prestamos', redirectTo: 'admin/prestamos', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
