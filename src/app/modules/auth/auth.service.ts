import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppError } from '../../core/errors/app-error';
import { ChangePinInput, Profile } from '../../core/models/profile.model';
import { AUTH_REPOSITORY } from '../../core/repositories/auth.repository';

const ACCESS_CLOSED_MESSAGE =
  'El acceso para cobradores está disponible de 7:00 a. m. a 8:00 p. m.';
const ACCESS_CHECK_CACHE_MS = 5_000;

@Service()
export class AuthService {
  private readonly authRepo = inject(AUTH_REPOSITORY);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _currentUser = signal<Profile | null>(this.getStoredUser());
  private readonly _collectorAccessClosed = signal(false);
  private accessTimer: ReturnType<typeof setTimeout> | null = null;
  private accessCheck: Promise<boolean> | null = null;
  private accessVerifiedUntil = 0;

  readonly currentUser = this._currentUser.asReadonly();
  readonly collectorAccessClosed = this._collectorAccessClosed.asReadonly();
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

  private readonly refreshWhenVisible = (): void => {
    if (this.document.visibilityState !== 'visible' || !this.isCollector()) return;

    void this.ensureCurrentAccess(true).then((allowed) => {
      if (!allowed) void this.navigateToAccessClosedLogin();
    });
  };

  constructor() {
    this.document.addEventListener('visibilitychange', this.refreshWhenVisible);
    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('visibilitychange', this.refreshWhenVisible);
      this.clearAccessMonitoring();
    });
  }

  async login(dni: string, pin: string): Promise<Profile> {
    const profile = await this.authRepo.login(dni, pin);
    this.saveUser(profile);

    if (profile.role === 'collector' && !(await this.ensureCurrentAccess(true))) {
      if (this._collectorAccessClosed()) {
        throw new AppError('AUTH_UNAUTHORIZED', ACCESS_CLOSED_MESSAGE);
      }

      throw new AppError(
        'SUPABASE_CONNECTION',
        'No se pudo verificar el horario de acceso. Intentá nuevamente.',
      );
    }

    return profile;
  }

  async ensureCurrentAccess(forceRefresh = false): Promise<boolean> {
    if (!this.isAuthenticated() || !this.isCollector()) {
      this.clearAccessMonitoring();
      this._collectorAccessClosed.set(false);
      return true;
    }

    if (!forceRefresh && Date.now() < this.accessVerifiedUntil) return true;
    if (this.accessCheck) return this.accessCheck;

    this.accessCheck = this.checkCollectorAccess().finally(() => {
      this.accessCheck = null;
    });
    return this.accessCheck;
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
      await this.router.navigate(['/login']);
    }
  }

  private async checkCollectorAccess(): Promise<boolean> {
    try {
      const status = await this.authRepo.currentAccessStatus();

      if (!status.allowed) {
        this._collectorAccessClosed.set(true);
        await this.clearSession();
        return false;
      }

      const serverNow = Date.parse(status.serverNow);
      const closesAt = Date.parse(status.closesAt);
      const delay = closesAt - serverNow;

      if (!Number.isFinite(delay) || delay <= 0) {
        this._collectorAccessClosed.set(true);
        await this.clearSession();
        return false;
      }

      this._collectorAccessClosed.set(false);
      this.accessVerifiedUntil = Date.now() + Math.min(delay, ACCESS_CHECK_CACHE_MS);
      this.scheduleAccessCheck(delay);
      return true;
    } catch {
      // Fail closed in the client too. PostgreSQL remains the authoritative
      // boundary, but a collector must not keep a stale operational screen.
      this._collectorAccessClosed.set(false);
      await this.clearSession();
      return false;
    }
  }

  private scheduleAccessCheck(delay: number): void {
    this.clearAccessTimer();
    this.accessTimer = setTimeout(() => {
      void this.ensureCurrentAccess(true).then((allowed) => {
        if (!allowed) void this.navigateToAccessClosedLogin();
      });
    }, delay);
  }

  private clearAccessTimer(): void {
    if (this.accessTimer === null) return;
    clearTimeout(this.accessTimer);
    this.accessTimer = null;
  }

  private clearAccessMonitoring(): void {
    this.clearAccessTimer();
    this.accessVerifiedUntil = 0;
  }

  private async clearSession(): Promise<void> {
    this.clearAccessMonitoring();
    try {
      await this.authRepo.logout();
    } catch {
      // Local cleanup must still happen when the network or Auth API is down.
    } finally {
      this.saveUser(null);
    }
  }

  private async navigateToAccessClosedLogin(): Promise<void> {
    await this.router.navigate(['/login'], { queryParams: { accessClosed: '1' } });
  }

  private getStoredUser(): Profile | null {
    try {
      const stored = localStorage.getItem('cobranzapro_user');
      if (!stored) return null;
      const user = JSON.parse(stored);
      if (user && user.role) {
        const role = String(user.role).toLowerCase();
        if (role === 'administrador' || role === 'admin') user.role = 'admin';
        else if (role === 'cobrador' || role === 'collector') user.role = 'collector';
        else if (role === 'supervisor') user.role = 'supervisor';
        user.mustChangePin = user.mustChangePin === true;
      }
      return user;
    } catch (error) {
      console.error('Error al leer usuario de localStorage', error);
      return null;
    }
  }

  private saveUser(profile: Profile | null): void {
    this._currentUser.set(profile);
    if (profile) {
      localStorage.setItem('cobranzapro_user', JSON.stringify(profile));
      return;
    }

    this.clearAccessMonitoring();
    localStorage.removeItem('cobranzapro_user');
  }
}
