import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { AuthService } from './auth.service';
import { adminAreaGuard, collectorAreaGuard } from './auth.guard';

describe('role area guards', () => {
  let role: 'admin' | 'supervisor' | 'collector' | null;
  let createUrlTree: ReturnType<typeof vi.fn>;

  const run = (guard: CanActivateFn) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  beforeEach(() => {
    role = null;
    createUrlTree = vi.fn((commands: string[]) => ({ commands }));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            isAdmin: () => role === 'admin',
            isSupervisor: () => role === 'supervisor',
            isCollector: () => role === 'collector',
          },
        },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
  });

  it('allows administrators and supervisors into the admin area', () => {
    role = 'admin';
    expect(run(adminAreaGuard)).toBe(true);

    role = 'supervisor';
    expect(run(adminAreaGuard)).toBe(true);
  });

  it('redirects collectors away from the admin area', () => {
    role = 'collector';

    expect(run(adminAreaGuard)).toEqual({ commands: ['/cobrador'] });
  });

  it('allows collectors into the collector area', () => {
    role = 'collector';

    expect(run(collectorAreaGuard)).toBe(true);
  });

  it('redirects privileged staff away from the collector area', () => {
    role = 'admin';
    expect(run(collectorAreaGuard)).toEqual({ commands: ['/admin'] });

    role = 'supervisor';
    expect(run(collectorAreaGuard)).toEqual({ commands: ['/admin'] });
  });
});
