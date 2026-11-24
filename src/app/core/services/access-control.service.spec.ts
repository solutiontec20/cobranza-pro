import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppError } from '../errors/app-error';
import { AccessContext } from '../models/access-control.model';
import { Profile } from '../models/profile.model';
import { ACCESS_CONTROL_REPOSITORY } from '../repositories/access-control.repository';
import { AuthService } from '../../modules/auth/auth.service';
import { AccessControlService } from './access-control.service';

function context(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    baseRole: 'admin',
    accessRole: 'system_administrator',
    permissions: ['dashboard.view', 'clients.view', 'loans.view'],
    updatedAt: null,
    operational: true,
    ...overrides,
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'admin-1',
    dni: '10000001',
    fullName: 'Admin',
    role: 'admin',
    active: true,
    mustChangePin: false,
    ...overrides,
  };
}

describe('AccessControlService', () => {
  const currentUser = signal<Profile | null>(null);
  const getCurrentContext = vi.fn<() => Promise<AccessContext>>();
  let service: AccessControlService;

  beforeEach(() => {
    currentUser.set(profile());
    getCurrentContext.mockReset().mockResolvedValue(context());

    TestBed.configureTestingModule({
      providers: [
        AccessControlService,
        { provide: ACCESS_CONTROL_REPOSITORY, useValue: { getCurrentContext } },
        {
          provide: AuthService,
          useValue: {
            currentUser,
            isAdmin: computed(() => currentUser()?.role === 'admin'),
            isSupervisor: computed(() => currentUser()?.role === 'supervisor'),
          },
        },
      ],
    });
    service = TestBed.inject(AccessControlService);
  });

  it('denies every permission until the context has been verified', () => {
    expect(service.ready()).toBe(false);
    expect(service.can('dashboard.view')).toBe(false);
    expect(service.canAny(['dashboard.view', 'loans.view'])).toBe(false);
    expect(getCurrentContext).not.toHaveBeenCalled();
  });

  it('exposes the permissions of the verified context', async () => {
    await expect(service.ensureLoaded()).resolves.toBe(true);

    expect(service.ready()).toBe(true);
    expect(service.accessRole()).toBe('system_administrator');
    expect(service.can('clients.view')).toBe(true);
    expect(service.can('loans.void')).toBe(false);
    expect(service.canAny(['loans.void', 'loans.view'])).toBe(true);
    expect(service.canAny(['loans.void', 'payments.void'])).toBe(false);
    expect(service.canAny([])).toBe(false);
  });

  it('does not request the context again once it is loaded for the same user', async () => {
    await service.ensureLoaded();
    await service.ensureLoaded();

    expect(getCurrentContext).toHaveBeenCalledOnce();
  });

  it('shares a single request between concurrent callers', async () => {
    const results = await Promise.all([service.ensureLoaded(), service.ensureLoaded()]);

    expect(results).toEqual([true, true]);
    expect(getCurrentContext).toHaveBeenCalledOnce();
  });

  it('reloads on demand so a revoked permission disappears', async () => {
    await service.ensureLoaded();
    getCurrentContext.mockResolvedValue(context({ permissions: ['dashboard.view'] }));

    await expect(service.reload()).resolves.toBe(true);

    expect(service.can('dashboard.view')).toBe(true);
    expect(service.can('clients.view')).toBe(false);
    expect(getCurrentContext).toHaveBeenCalledTimes(2);
  });

  it('never requests permissions for collectors or anonymous sessions', async () => {
    currentUser.set(profile({ id: 'collector-1', role: 'collector' }));
    await expect(service.ensureLoaded()).resolves.toBe(false);

    currentUser.set(null);
    await expect(service.ensureLoaded()).resolves.toBe(false);

    expect(getCurrentContext).not.toHaveBeenCalled();
    expect(service.can('dashboard.view')).toBe(false);
  });

  it('fails closed with a user-facing message when the context cannot be loaded', async () => {
    getCurrentContext.mockRejectedValue(
      new AppError('SUPABASE_RPC', 'No se pudo cargar el contexto de permisos.'),
    );

    await expect(service.ensureLoaded()).resolves.toBe(false);

    expect(service.ready()).toBe(false);
    expect(service.can('dashboard.view')).toBe(false);
    expect(service.error()).toBe('No se pudo cargar el contexto de permisos.');
    expect(service.loading()).toBe(false);
  });

  it('fails closed when the server reports the profile as not operational', async () => {
    getCurrentContext.mockResolvedValue(context({ operational: false, permissions: [] }));

    await expect(service.ensureLoaded()).resolves.toBe(false);

    expect(service.ready()).toBe(false);
    expect(service.error()).toBe('No se pudo confirmar tu acceso administrativo.');
  });

  it('fails closed when the server base role differs from the session role', async () => {
    getCurrentContext.mockResolvedValue(context({ baseRole: 'supervisor' }));

    await expect(service.ensureLoaded()).resolves.toBe(false);

    expect(service.can('dashboard.view')).toBe(false);
  });

  it('ignores a late response that belongs to a previous user', async () => {
    let resolveFirst!: (value: AccessContext) => void;
    getCurrentContext.mockImplementationOnce(
      () => new Promise<AccessContext>((resolve) => (resolveFirst = resolve)),
    );

    const pending = service.ensureLoaded();
    currentUser.set(profile({ id: 'admin-2', fullName: 'Other admin' }));
    getCurrentContext.mockResolvedValue(context({ permissions: ['analytics.view'] }));
    await service.reload();

    resolveFirst(context({ permissions: ['loans.void'] }));
    await expect(pending).resolves.toBe(false);

    expect(service.can('analytics.view')).toBe(true);
    expect(service.can('loans.void')).toBe(false);
  });

  it('forgets every permission when the session ends', async () => {
    await service.ensureLoaded();
    expect(service.can('dashboard.view')).toBe(true);

    currentUser.set(null);
    TestBed.tick();

    expect(service.ready()).toBe(false);
    expect(service.permissions()).toEqual([]);
    expect(service.can('dashboard.view')).toBe(false);
  });
});
