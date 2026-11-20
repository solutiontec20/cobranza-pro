import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanMatchFn, provideRouter, Route, UrlSegment, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { adminCanMatch, authGuard, collectorCanMatch, publicGuard } from './auth.guard';

describe('role CanMatch guards', () => {
  const auth = {
    isAuthenticated: signal(false),
    mustChangePin: signal(false),
    isAdmin: signal(false),
    isSupervisor: signal(false),
    isCollector: signal(false),
    collectorAccessClosed: signal(false),
    ensureCurrentAccess: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    auth.isAuthenticated.set(false);
    auth.mustChangePin.set(false);
    auth.isAdmin.set(false);
    auth.isSupervisor.set(false);
    auth.isCollector.set(false);
    auth.collectorAccessClosed.set(false);
    auth.ensureCurrentAccess.mockReset().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
  });

  it('redirects unauthenticated users to login', () => {
    expectGuardRedirect(collectorCanMatch, '/login');
    expectGuardRedirect(adminCanMatch, '/login');
  });

  it('redirects users who must change their PIN before matching a role area', () => {
    auth.isAuthenticated.set(true);
    auth.mustChangePin.set(true);

    expectGuardRedirect(collectorCanMatch, '/cambiar-pin');
    expectGuardRedirect(adminCanMatch, '/cambiar-pin');
  });

  it('allows collectors to match only the collector area', () => {
    auth.isAuthenticated.set(true);
    auth.isCollector.set(true);

    expect(runGuard(collectorCanMatch)).toBe(true);
    expectGuardRedirect(adminCanMatch, '/cobrador');
  });

  it('allows administrators to match only the admin area', () => {
    auth.isAuthenticated.set(true);
    auth.isAdmin.set(true);

    expect(runGuard(adminCanMatch)).toBe(true);
    expectGuardRedirect(collectorCanMatch, '/admin');
  });

  it('allows supervisors to match only the admin area', () => {
    auth.isAuthenticated.set(true);
    auth.isSupervisor.set(true);

    expect(runGuard(adminCanMatch)).toBe(true);
    expectGuardRedirect(collectorCanMatch, '/admin');
  });

  it('redirects an authenticated profile with no recognized role to login', () => {
    auth.isAuthenticated.set(true);

    expectGuardRedirect(collectorCanMatch, '/login');
    expectGuardRedirect(adminCanMatch, '/login');
  });

  it('prevents a collector with a restored session from activating the shell outside access hours', async () => {
    auth.isAuthenticated.set(true);
    auth.isCollector.set(true);
    auth.collectorAccessClosed.set(true);
    auth.ensureCurrentAccess.mockResolvedValue(false);

    const result = await runActivateGuard(authGuard);

    expect(result).toBeInstanceOf(UrlTree);
    expect(result.toString()).toBe('/login?accessClosed=1');
  });

  it('allows the login route after an expired collector access window clears the session', async () => {
    auth.isAuthenticated.set(true);
    auth.isCollector.set(true);
    auth.collectorAccessClosed.set(true);
    auth.ensureCurrentAccess.mockImplementation(async () => {
      auth.isAuthenticated.set(false);
      return false;
    });

    const result = await runActivateGuard(publicGuard);

    expect(result).toBeInstanceOf(UrlTree);
    expect(result.toString()).toBe('/login?accessClosed=1');
  });

  function runGuard(guard: CanMatchFn): boolean | UrlTree {
    const result = TestBed.runInInjectionContext(() =>
      guard({} as Route, [] as UrlSegment[], {} as Parameters<CanMatchFn>[2]),
    );

    if (typeof result === 'boolean' || result instanceof UrlTree) {
      return result;
    }

    throw new Error('The role guard must return synchronously');
  }

  function expectGuardRedirect(guard: CanMatchFn, expectedUrl: string): void {
    const result = runGuard(guard);
    expect(result).toBeInstanceOf(UrlTree);
    expect(result.toString()).toBe(expectedUrl);
  }

  async function runActivateGuard(guard: typeof authGuard): Promise<boolean | UrlTree> {
    const result = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    const resolved = await Promise.resolve(result as boolean | UrlTree | Promise<boolean | UrlTree>);

    if (typeof resolved === 'boolean' || resolved instanceof UrlTree) return resolved;
    throw new Error('The activation guard returned an unsupported result');
  }
});
