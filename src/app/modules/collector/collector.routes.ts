import { Routes } from '@angular/router';

export const COLLECTOR_ROUTES: Routes = [
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
  }
];
