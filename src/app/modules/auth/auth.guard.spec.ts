import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CanMatchFn, provideRouter, Route, UrlSegment, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { adminCanMatch, collectorCanMatch } from './auth.guard';

describe('role CanMatch guards', () => {
  const auth = {
    isAuthenticated: signal(false),
    mustChangePin: signal(false),
    isAdmin: signal(false),
    isSupervisor: signal(false),
    isCollector: signal(false),
  };

  beforeEach(() => {
    auth.isAuthenticated.set(false);
    auth.mustChangePin.set(false);
    auth.isAdmin.set(false);
    auth.isSupervisor.set(false);
    auth.isCollector.set(false);

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
});
