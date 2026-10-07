import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard') },
  { path: 'clientes', loadComponent: () => import('./clients/clients') },
  { path: 'prestamos', loadComponent: () => import('./loans/loans') },
  { path: 'cobradores', loadComponent: () => import('./collectors/collectors') },
  { path: 'control-diario', loadComponent: () => import('./daily-control/daily-control') },
  { path: 'auditoria', loadComponent: () => import('./audit/audit') },
];
