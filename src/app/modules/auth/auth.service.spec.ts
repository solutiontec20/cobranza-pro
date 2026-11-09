import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AccessStatus, Profile } from '../../core/models/profile.model';
import { AUTH_REPOSITORY, AuthRepository } from '../../core/repositories/auth.repository';
import { AuthService } from './auth.service';

describe('AuthService collector access monitoring', () => {
  const collector: Profile = {
    id: 'collector-1',
    dni: '70000001',
    fullName: 'Collector Test',
    role: 'collector',
    active: true,
    mustChangePin: false,
  };
  const admin: Profile = { ...collector, id: 'admin-1', role: 'admin' };
  const openStatus: AccessStatus = {
    allowed: true,
    role: 'collector',
    serverNow: '2026-11-05T19:59:59-05:00',
    opensAt: '2026-11-05T07:00:00-05:00',
    closesAt: '2026-11-05T20:00:00-05:00',
  };

  let repository: {
    [K in keyof AuthRepository]: ReturnType<typeof vi.fn<AuthRepository[K]>>;
  };
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() {
        return storage.size;
      },
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => [...storage.keys()][index] ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    } satisfies Storage);
    repository = {
      login: vi.fn<AuthRepository['login']>(),
      currentUser: vi.fn<AuthRepository['currentUser']>(),
      currentAccessStatus: vi.fn<AuthRepository['currentAccessStatus']>(),
      changePin: vi.fn<AuthRepository['changePin']>(),
      logout: vi.fn<AuthRepository['logout']>().mockResolvedValue(undefined),
    };
    navigate = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AUTH_REPOSITORY, useValue: repository },
        { provide: Router, useValue: { navigate } },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not request an access window for administrators', async () => {
    repository.login.mockResolvedValue(admin);
    const service = TestBed.inject(AuthService);

    await service.login(admin.dni, '123456');

    expect(repository.currentAccessStatus).not.toHaveBeenCalled();
  });

  it('logs a collector out when the server-side closing boundary is reached', async () => {
    repository.login.mockResolvedValue(collector);
    repository.currentAccessStatus
      .mockResolvedValueOnce(openStatus)
      .mockResolvedValueOnce({ ...openStatus, allowed: false });
    const service = TestBed.inject(AuthService);

    await service.login(collector.dni, '123456');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(repository.currentAccessStatus).toHaveBeenCalledTimes(2);
    expect(repository.logout).toHaveBeenCalledOnce();
    expect(service.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { accessClosed: '1' },
    });
  });
});
