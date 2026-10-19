import { Service, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Profile } from '../../core/models/profile.model';
import { AUTH_REPOSITORY } from '../../core/repositories/auth.repository';

@Service()
export class AuthService {

  private authRepo = inject(AUTH_REPOSITORY);
  private router = inject(Router);

  private _currentUser = signal<Profile | null>(this.getStoredUser());
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly isAdmin = computed(() => this._currentUser()?.role === 'admin');
  readonly isSupervisor = computed(() => this._currentUser()?.role === 'supervisor');
  readonly isCollector = computed(() => this._currentUser()?.role === 'collector');


  private getStoredUser(): Profile | null {
    try {
      const stored = localStorage.getItem('cobranzapro_user');
      return stored ? JSON.parse(stored) : null;
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

  async logout(): Promise<void> {
    try {
      await this.authRepo.logout();
    } finally {
      this.saveUser(null);
      this.router.navigate(['/login']);
    }
  }
}
