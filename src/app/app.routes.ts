import { Routes } from '@angular/router';
import { authGuard } from './modules/auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadChildren: () => import('./modules/auth/auth.routes').then(m => m.AUTH_ROUTES),
  },
  {
    path: '',
    loadComponent: () => import('./shell/app-shell'),
    // canActivate: [authGuard],
    children: [
      // Collector routes
      {
        path: 'cobrador',
        loadChildren: () => import('./modules/collector/collector.routes').then(m => m.COLLECTOR_ROUTES),
      },
      // Admin routes
      {
        path: 'admin',
        loadChildren: () => import('./modules/admin/admin.routes').then(m => m.ADMIN_ROUTES),
      },
      // Redirects
      { path: 'dashboard', redirectTo: 'cobrador', pathMatch: 'full' },
      { path: 'clientes', redirectTo: 'admin/clientes', pathMatch: 'full' },
      { path: 'prestamos', redirectTo: 'admin/prestamos', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
