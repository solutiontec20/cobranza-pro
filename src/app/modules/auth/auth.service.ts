import { Service, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChangePinInput, Profile } from '../../core/models/profile.model';
import { AUTH_REPOSITORY } from '../../core/repositories/auth.repository';

@Service()
export class AuthService {

  private authRepo = inject(AUTH_REPOSITORY);
  private router = inject(Router);

  private _currentUser = signal<Profile | null>(this.getStoredUser());
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly mustChangePin = computed(() => this._currentUser()?.mustChangePin === true);
  readonly isAdmin = computed(() => {
    const role = this._currentUser()?.role?.toLowerCase();
    return role === 'admin' || role === 'administrador';
  });
  readonly isSupervisor = computed(() => {
    const role = this._currentUser()?.role?.toLowerCase();
    return role === 'supervisor';
  });
  readonly isCollector = computed(() => {
    const role = this._currentUser()?.role?.toLowerCase();
    return role === 'collector' || role === 'cobrador';
  });

  private getStoredUser(): Profile | null {
    try {
      const stored = localStorage.getItem('cobranzapro_user');
      if (!stored) return null;
      const user = JSON.parse(stored);
      if (user && user.role) {
        const r = String(user.role).toLowerCase();
        if (r === 'administrador' || r === 'admin') user.role = 'admin';
        else if (r === 'cobrador' || r === 'collector') user.role = 'collector';
        else if (r === 'supervisor') user.role = 'supervisor';
        user.mustChangePin = user.mustChangePin === true;
      }
      return user;
    } catch (e) {
      console.error('Error al leer usuario de localStorage', e);
      return null;
    }
  }

  private saveUser(profile: Profile | null): void {
    this._currentUser.set(profile);
    if (profile) {
      localStorage.setItem('cobranzapro_user', JSON.stringify(profile));
    } else {
      localStorage.removeItem('cobranzapro_user');
    }
  }

  async login(dni: string, pin: string): Promise<Profile> {
    const profile = await this.authRepo.login(dni, pin);
    this.saveUser(profile);
    return profile;
  }

  async changePin(input: ChangePinInput): Promise<void> {
    await this.authRepo.changePin(input);

    try {
      await this.authRepo.logout();
    } finally {
      this.saveUser(null);
      await this.router.navigate(['/login'], { queryParams: { pinChanged: '1' } });
    }
  }

  async logout(): Promise<void> {
    try {
      await this.authRepo.logout();
    } finally {
      this.saveUser(null);
      this.router.navigate(['/login']);
    }
  }
}
