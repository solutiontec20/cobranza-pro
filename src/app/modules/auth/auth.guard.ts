import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

export const operationalGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (auth.mustChangePin()) {
    return router.createUrlTree(['/cambiar-pin']);
  }

  return true;
};

export const collectorCanMatch: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (auth.mustChangePin()) {
    return router.createUrlTree(['/cambiar-pin']);
  }

  if (auth.isCollector()) {
    return true;
  }

  if (auth.isAdmin() || auth.isSupervisor()) {
    return router.createUrlTree(['/admin']);
  }

  return router.createUrlTree(['/login']);
};

export const adminCanMatch: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (auth.mustChangePin()) {
    return router.createUrlTree(['/cambiar-pin']);
  }

  if (auth.isAdmin() || auth.isSupervisor()) {
    return true;
  }

  if (auth.isCollector()) {
    return router.createUrlTree(['/cobrador']);
  }

  return router.createUrlTree(['/login']);
};

export const publicGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return true;
  }

  if (auth.mustChangePin()) {
    return router.createUrlTree(['/cambiar-pin']);
  }

  if (auth.isCollector()) {
    return router.createUrlTree(['/cobrador']);
  }

  if (auth.isAdmin() || auth.isSupervisor()) {
    return router.createUrlTree(['/admin']);
  }

  return true;
};
