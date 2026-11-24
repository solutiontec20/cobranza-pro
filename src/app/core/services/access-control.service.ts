import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, computed, effect, inject, signal } from '@angular/core';
import { AppError } from '../errors/app-error';
import { AccessContext, AccessPermission } from '../models/access-control.model';
import { ACCESS_CONTROL_REPOSITORY } from '../repositories/access-control.repository';
import { AuthService } from '../../modules/auth/auth.service';

@Service({ autoProvided: false })
export class AccessControlService {
  private readonly repository = inject(ACCESS_CONTROL_REPOSITORY);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly _permissions = signal<AccessPermission[]>([]);
  private readonly _accessRole = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _ready = signal(false);
  private loadedForUserId: string | null = null;
  private loadRequest: Promise<boolean> | null = null;
  private loadRequestUserId: string | null = null;
  private generation = 0;

  readonly permissions = this._permissions.asReadonly();
  readonly accessRole = this._accessRole.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly ready = this._ready.asReadonly();

  private readonly refreshWhenVisible = (): void => {
    if (this.document.visibilityState === 'visible' && this.isAdministrativeUser()) {
      void this.reload();
    }
  };

  constructor() {
    effect(() => {
      if (!this.isAdministrativeUser()) this.clear();
    });

    this.document.addEventListener('visibilitychange', this.refreshWhenVisible);
    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('visibilitychange', this.refreshWhenVisible);
    });
  }

  can(permission: AccessPermission): boolean {
    return this._ready() && this._permissions().includes(permission);
  }

  canAny(permissions: readonly AccessPermission[]): boolean {
    return (
      this._ready() && permissions.some((permission) => this._permissions().includes(permission))
    );
  }

  ensureLoaded(): Promise<boolean> {
    const user = this.auth.currentUser();
    if (!user || !this.isAdministrativeUser()) {
      this.clear();
      return Promise.resolve(false);
    }

    if (this._ready() && this.loadedForUserId === user.id) return Promise.resolve(true);
    if (this.loadRequest && this.loadRequestUserId === user.id) return this.loadRequest;
    return this.loadFor(user.id);
  }

  reload(): Promise<boolean> {
    const user = this.auth.currentUser();
    if (!user || !this.isAdministrativeUser()) {
      this.clear();
      return Promise.resolve(false);
    }

    // Only share an in-flight request that belongs to this same user; never another session's.
    if (this.loadRequest && this.loadRequestUserId === user.id) return this.loadRequest;
    return this.loadFor(user.id);
  }

  clear(): void {
    this.generation += 1;
    this.loadRequest = null;
    this.loadRequestUserId = null;
    this.loadedForUserId = null;
    this._permissions.set([]);
    this._accessRole.set(null);
    this._loading.set(false);
    this._error.set(null);
    this._ready.set(false);
  }

  private loadFor(userId: string): Promise<boolean> {
    const generation = ++this.generation;
    this.loadedForUserId = null;
    this._permissions.set([]);
    this._accessRole.set(null);
    this._loading.set(true);
    this._error.set(null);
    this._ready.set(false);

    let request: Promise<boolean>;
    request = this.repository
      .getCurrentContext()
      .then((context) => this.acceptContext(context, userId, generation))
      .catch((error: unknown) => {
        if (generation === this.generation) {
          this._permissions.set([]);
          this._accessRole.set(null);
          this._error.set(
            AppError.from(error, 'SUPABASE_RPC').message ||
              'No se pudo verificar el acceso administrativo.',
          );
          this._ready.set(false);
          this.loadedForUserId = null;
        }
        return false;
      })
      .finally(() => {
        if (generation === this.generation) this._loading.set(false);
        if (this.loadRequest === request) {
          this.loadRequest = null;
          this.loadRequestUserId = null;
        }
      });

    this.loadRequest = request;
    this.loadRequestUserId = userId;
    return request;
  }

  private acceptContext(context: AccessContext, userId: string, generation: number): boolean {
    const currentUser = this.auth.currentUser();
    if (
      generation !== this.generation ||
      currentUser?.id !== userId ||
      !this.isAdministrativeUser() ||
      !context.operational ||
      context.baseRole !== currentUser.role
    ) {
      if (generation === this.generation) {
        this._permissions.set([]);
        this._accessRole.set(null);
        this._error.set('No se pudo confirmar tu acceso administrativo.');
        this._ready.set(false);
        this.loadedForUserId = null;
      }
      return false;
    }

    this._permissions.set(context.permissions);
    this._accessRole.set(context.accessRole);
    this._error.set(null);
    this._ready.set(true);
    this.loadedForUserId = userId;
    return true;
  }

  private isAdministrativeUser(): boolean {
    return this.auth.isAdmin() || this.auth.isSupervisor();
  }
}
