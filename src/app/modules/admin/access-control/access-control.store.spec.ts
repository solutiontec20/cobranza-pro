import { TestBed } from '@angular/core/testing';
import { AppError } from '../../../core/errors/app-error';
import {
  AccessAssignment,
  AccessRole,
  CollectorAccessSchedule,
} from '../../../core/models/access-control.model';
import {
  ACCESS_CONTROL_REPOSITORY,
  AccessControlRepository,
} from '../../../core/repositories/access-control.repository';
import { AccessControlStore } from './access-control.store';

const roles: AccessRole[] = [
  {
    roleId: 'r1',
    slug: 'system_administrator',
    name: 'Administrador',
    description: '',
    active: true,
    isSystem: true,
    assignedUsers: 1,
    permissions: ['roles.view'],
  },
];
const assignments: AccessAssignment[] = [
  {
    profileId: 'p1',
    fullName: 'Sofía',
    dni: '10000002',
    baseRole: 'supervisor',
    accessRoleId: 'r1',
    accessRoleSlug: 'supervisor_default',
    accessRoleName: 'Default supervisor',
  },
];
const schedule: CollectorAccessSchedule = {
  startTime: '07:00',
  endTime: '20:00',
  timezone: 'America/Lima',
};

describe('AccessControlStore', () => {
  let store: AccessControlStore;
  let repository: { [K in keyof AccessControlRepository]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    repository = {
      getCurrentContext: vi.fn(),
      listRoles: vi.fn().mockResolvedValue(roles),
      getRole: vi.fn(),
      createRole: vi.fn().mockResolvedValue('new-role'),
      updateRole: vi.fn().mockResolvedValue(undefined),
      setRoleActive: vi.fn().mockResolvedValue(undefined),
      listAssignments: vi.fn().mockResolvedValue(assignments),
      assignRole: vi.fn().mockResolvedValue(undefined),
      getCollectorSchedule: vi.fn().mockResolvedValue(schedule),
      updateCollectorSchedule: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [AccessControlStore, { provide: ACCESS_CONTROL_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(AccessControlStore);
  });

  it('loads roles, assignments and the collector schedule for a system administrator', async () => {
    await store.initialize(true);

    expect(store.roles()).toEqual(roles);
    expect(store.assignments()).toEqual(assignments);
    expect(store.schedule()).toEqual(schedule);
    expect(store.hasSchedule()).toBe(true);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('does not request the collector schedule for a read-only user', async () => {
    await store.initialize(false);

    expect(repository.getCollectorSchedule).not.toHaveBeenCalled();
    expect(store.schedule()).toBeNull();
    expect(store.roles()).toEqual(roles);
  });

  it('surfaces a user-facing message when loading fails', async () => {
    repository.listRoles.mockRejectedValue(
      new AppError('SUPABASE_RPC', 'No se pudieron cargar los roles.'),
    );

    await store.initialize(true);

    expect(store.error()).toBe('No se pudieron cargar los roles.');
    expect(store.loading()).toBe(false);
  });

  it('creates a role, refreshes the list and warns that a new login is required', async () => {
    const created = await store.createRole({
      name: 'Operador',
      description: '',
      permissions: ['clients.view'],
      reason: 'Nuevo puesto',
    });

    expect(created).toBe(true);
    expect(repository.createRole).toHaveBeenCalledOnce();
    expect(repository.listRoles).toHaveBeenCalledOnce();
    expect(store.notice()).toContain('iniciar sesión nuevamente');
    expect(store.saving()).toBe(false);
  });

  it('keeps the failure message and reports false when a mutation is rejected', async () => {
    repository.createRole.mockRejectedValue(
      new AppError('AUTH_UNAUTHORIZED', 'No tenés permisos para realizar esta acción.'),
    );

    const created = await store.createRole({
      name: 'Operador',
      description: '',
      permissions: [],
      reason: 'x',
    });

    expect(created).toBe(false);
    expect(store.error()).toBe('No tenés permisos para realizar esta acción.');
    expect(store.notice()).toBeNull();
    expect(repository.listRoles).not.toHaveBeenCalled();
    expect(store.saving()).toBe(false);
  });

  it('clears a previous notice or error before the next mutation', async () => {
    repository.createRole.mockRejectedValueOnce(new Error('falló'));
    await store.createRole({ name: 'A', description: '', permissions: [], reason: 'x' });
    expect(store.error()).toBe('falló');

    await store.updateRole({
      roleId: 'r1',
      name: 'A',
      description: '',
      permissions: [],
      reason: 'x',
    });

    expect(store.error()).toBeNull();
    expect(store.notice()).toContain('actualizó');
  });

  it('refreshes roles and assignments after assigning a role', async () => {
    const assigned = await store.assignRole({ profileId: 'p1', roleId: 'r1', reason: 'Cambio' });

    expect(assigned).toBe(true);
    expect(repository.assignRole).toHaveBeenCalledWith({
      profileId: 'p1',
      roleId: 'r1',
      reason: 'Cambio',
    });
    expect(store.assignments()).toEqual(assignments);
    expect(store.roles()).toEqual(roles);
  });

  it('reloads the schedule after saving it', async () => {
    repository.getCollectorSchedule.mockResolvedValue({ ...schedule, startTime: '08:00' });

    const saved = await store.updateSchedule({
      startTime: '08:00',
      endTime: '20:00',
      reason: 'Turno',
    });

    expect(saved).toBe(true);
    expect(store.schedule()?.startTime).toBe('08:00');
    expect(store.notice()).toContain('cobradores activos');
  });
});
