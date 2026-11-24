import { TestBed } from '@angular/core/testing';
import { AppError } from '../errors/app-error';
import { SUPABASE } from '../supabase/supabase-client';
import { SupabaseAccessControlRepository } from './supabase-access-control.repository';

const validContext = {
  baseRole: 'supervisor',
  accessRole: 'supervisor_default',
  permissions: ['dashboard.view', 'clients.view'],
  updatedAt: '2026-11-23T12:00:00Z',
  operational: true,
};

describe('SupabaseAccessControlRepository', () => {
  const rpc = vi.fn();
  let repository: SupabaseAccessControlRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [SupabaseAccessControlRepository, { provide: SUPABASE, useValue: { rpc } }],
    });
    repository = TestBed.inject(SupabaseAccessControlRepository);
  });

  describe('current context', () => {
    it('maps a valid context', async () => {
      rpc.mockResolvedValue({ data: validContext, error: null });

      await expect(repository.getCurrentContext()).resolves.toEqual(validContext);
      expect(rpc).toHaveBeenCalledWith('current_access_context');
    });

    it.each([
      ['a collector base role', { ...validContext, baseRole: 'collector' }],
      [
        'an unknown permission code',
        { ...validContext, permissions: ['dashboard.view', 'root.all'] },
      ],
      ['permissions that are not an array', { ...validContext, permissions: 'dashboard.view' }],
      ['a missing operational flag', { ...validContext, operational: undefined }],
      ['a non-object payload', 'ok'],
      ['an empty payload', null],
    ])('rejects %s instead of trusting it', async (_label, data) => {
      rpc.mockResolvedValue({ data, error: null });

      await expect(repository.getCurrentContext()).rejects.toMatchObject({
        code: 'SUPABASE_RPC',
        message: 'El servidor devolvió un contexto de permisos inválido.',
      });
    });

    it('translates a permission failure without leaking the database message', async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'Application profile required' },
      });

      await expect(repository.getCurrentContext()).rejects.toMatchObject({
        code: 'AUTH_UNAUTHORIZED',
        message: 'No se pudo verificar tu acceso administrativo.',
      });
    });
  });

  describe('roles', () => {
    it('maps the role list', async () => {
      rpc.mockResolvedValue({
        data: [
          {
            role_id: 'role-1',
            slug: 'custom_reader',
            name: 'Lector',
            description: 'Solo consulta',
            active: true,
            is_system: false,
            assigned_users: '2',
            permissions: ['clients.view'],
          },
        ],
        error: null,
      });

      await expect(repository.listRoles()).resolves.toEqual([
        {
          roleId: 'role-1',
          slug: 'custom_reader',
          name: 'Lector',
          description: 'Solo consulta',
          active: true,
          isSystem: false,
          assignedUsers: 2,
          permissions: ['clients.view'],
        },
      ]);
    });

    it('rejects a role carrying an unknown permission', async () => {
      rpc.mockResolvedValue({
        data: [
          {
            role_id: 'role-1',
            slug: 'x',
            name: 'X',
            description: '',
            active: true,
            is_system: false,
            assigned_users: 0,
            permissions: ['clients.view', 'root.all'],
          },
        ],
        error: null,
      });

      await expect(repository.listRoles()).rejects.toMatchObject({
        message: 'El servidor devolvió permisos inválidos.',
      });
    });

    it('creates a role with the exact RPC arguments and returns its id', async () => {
      rpc.mockResolvedValue({ data: 'new-role-id', error: null });

      await expect(
        repository.createRole({
          name: 'Operador',
          description: 'Atiende clientes',
          permissions: ['clients.view', 'clients.create'],
          reason: 'Nuevo puesto',
        }),
      ).resolves.toBe('new-role-id');

      expect(rpc).toHaveBeenCalledWith('admin_create_access_role', {
        p_name: 'Operador',
        p_description: 'Atiende clientes',
        p_permission_codes: ['clients.view', 'clients.create'],
        p_reason: 'Nuevo puesto',
      });
    });

    it('rejects a creation that the server did not confirm with an id', async () => {
      rpc.mockResolvedValue({ data: null, error: null });

      await expect(
        repository.createRole({ name: 'X', description: '', permissions: [], reason: 'motivo' }),
      ).rejects.toMatchObject({ message: 'El servidor no confirmó la creación del rol.' });
    });

    it('updates and toggles roles with their reasons', async () => {
      rpc.mockResolvedValue({ data: null, error: null });

      await repository.updateRole({
        roleId: 'role-1',
        name: 'Nuevo',
        description: '',
        permissions: ['dashboard.view'],
        reason: 'Ajuste',
      });
      await repository.setRoleActive({ roleId: 'role-1', active: false, reason: 'Obsoleto' });

      expect(rpc).toHaveBeenNthCalledWith(1, 'admin_update_access_role', {
        p_role_id: 'role-1',
        p_name: 'Nuevo',
        p_description: '',
        p_permission_codes: ['dashboard.view'],
        p_reason: 'Ajuste',
      });
      expect(rpc).toHaveBeenNthCalledWith(2, 'admin_set_access_role_active', {
        p_role_id: 'role-1',
        p_active: false,
        p_reason: 'Obsoleto',
      });
    });
  });

  describe('assignments', () => {
    it('maps the assignments and sends the assignment arguments', async () => {
      rpc.mockResolvedValueOnce({
        data: [
          {
            profile_id: 'p1',
            full_name: 'Sofía',
            dni: '10000002',
            base_role: 'supervisor',
            access_role_id: 'r1',
            access_role_slug: 'supervisor_default',
            access_role_name: 'Default supervisor',
          },
        ],
        error: null,
      });
      rpc.mockResolvedValueOnce({ data: null, error: null });

      await expect(repository.listAssignments()).resolves.toEqual([
        {
          profileId: 'p1',
          fullName: 'Sofía',
          dni: '10000002',
          baseRole: 'supervisor',
          accessRoleId: 'r1',
          accessRoleSlug: 'supervisor_default',
          accessRoleName: 'Default supervisor',
        },
      ]);

      await repository.assignRole({ profileId: 'p1', roleId: 'r2', reason: 'Cambio de puesto' });
      expect(rpc).toHaveBeenLastCalledWith('admin_assign_access_role', {
        p_profile_id: 'p1',
        p_role_id: 'r2',
        p_reason: 'Cambio de puesto',
      });
    });
  });

  describe('collector schedule', () => {
    it('drops the seconds and keeps the Lima timezone', async () => {
      rpc.mockResolvedValue({
        data: [{ start_time: '07:00:00', end_time: '20:00:00', timezone: 'America/Lima' }],
        error: null,
      });

      await expect(repository.getCollectorSchedule()).resolves.toEqual({
        startTime: '07:00',
        endTime: '20:00',
        timezone: 'America/Lima',
      });
    });

    it.each([
      ['a different timezone', { start_time: '07:00:00', end_time: '20:00:00', timezone: 'UTC' }],
      [
        'an inverted interval',
        { start_time: '20:00:00', end_time: '07:00:00', timezone: 'America/Lima' },
      ],
      [
        'an empty interval',
        { start_time: '08:00:00', end_time: '08:00:00', timezone: 'America/Lima' },
      ],
    ])('rejects %s', async (_label, row) => {
      rpc.mockResolvedValue({ data: [row], error: null });

      await expect(repository.getCollectorSchedule()).rejects.toMatchObject({
        message: 'El servidor devolvió un horario de acceso inválido.',
      });
    });

    it('rejects a missing schedule instead of assuming a default', async () => {
      rpc.mockResolvedValue({ data: [], error: null });

      await expect(repository.getCollectorSchedule()).rejects.toBeInstanceOf(AppError);
    });

    it('updates the schedule with a reason', async () => {
      rpc.mockResolvedValue({ data: null, error: null });

      await repository.updateCollectorSchedule({
        startTime: '08:00',
        endTime: '17:00',
        reason: 'Turno',
      });

      expect(rpc).toHaveBeenCalledWith('admin_update_collector_access_schedule', {
        p_start_time: '08:00',
        p_end_time: '17:00',
        p_reason: 'Turno',
      });
    });
  });

  describe('error translation', () => {
    it.each([
      [
        'Self assignment is prohibited',
        'AUTH_UNAUTHORIZED',
        'No podés cambiar tu propia asignación de rol.',
      ],
      [
        'Required access permission is missing',
        'AUTH_UNAUTHORIZED',
        'No tenés permisos para realizar esta acción.',
      ],
      [
        'System roles cannot be modified',
        'AUTH_UNAUTHORIZED',
        'Los roles reservados no se pueden modificar.',
      ],
      ['A nonblank reason is required', 'VALIDATION', 'Ingresá el motivo del cambio.'],
      [
        'An assigned role cannot be deactivated',
        'VALIDATION',
        'No se puede desactivar un rol que tiene usuarios asignados.',
      ],
      [
        'Each action permission requires its module view permission',
        'VALIDATION',
        'Cada acción requiere también el permiso de visualización de su módulo.',
      ],
    ])('translates the SQL message "%s"', async (message, code, expected) => {
      rpc.mockResolvedValue({ data: null, error: { code: '42501', message } });

      await expect(
        repository.assignRole({ profileId: 'p', roleId: 'r', reason: 'x' }),
      ).rejects.toMatchObject({
        code,
        message: expected,
      });
    });

    it('falls back to a safe message for an unknown database error', async () => {
      rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal detail' } });

      await expect(
        repository.assignRole({ profileId: 'p', roleId: 'r', reason: 'x' }),
      ).rejects.toMatchObject({ code: 'SUPABASE_RPC', message: 'No se pudo asignar el rol.' });
    });

    it('reports an unavailable server as a connection problem', async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: '08006', message: 'connection failure' },
      });

      await expect(repository.listRoles()).rejects.toMatchObject({ code: 'SUPABASE_CONNECTION' });
    });
  });
});
