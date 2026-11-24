import { inject, Service } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../errors/app-error';
import {
  AccessAssignment,
  AccessContext,
  AdministrativeBaseRole,
  AccessPermission,
  AccessRole,
  CollectorAccessSchedule,
  isAccessPermission,
} from '../models/access-control.model';
import { AccessControlRepository } from '../repositories/access-control.repository';
import { Database, Json } from '../supabase/database.types';
import { SUPABASE } from '../supabase/supabase-client';

@Service({ autoProvided: false })
export class SupabaseAccessControlRepository implements AccessControlRepository {
  private readonly supabase = inject(SUPABASE) as SupabaseClient<Database>;

  async getCurrentContext(): Promise<AccessContext> {
    const { data, error } = await this.supabase.rpc('current_access_context');

    if (error) {
      if (error.code === '42501') {
        throw new AppError(
          'AUTH_UNAUTHORIZED',
          'No se pudo verificar tu acceso administrativo.',
          error,
        );
      }
      throw new AppError('SUPABASE_RPC', 'No se pudo cargar el contexto de permisos.', error);
    }

    return this.toContext(data);
  }

  async listRoles(): Promise<AccessRole[]> {
    const { data, error } = await this.supabase.rpc('admin_list_access_roles');
    if (error) throw this.toAccessError(error, 'No se pudieron cargar los roles.');
    return (data ?? []).map((row) => {
      const permissions = this.toPermissions(row.permissions);
      return {
        roleId: row.role_id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        active: row.active,
        isSystem: row.is_system,
        assignedUsers: Number(row.assigned_users),
        permissions,
      };
    });
  }

  async getRole(roleId: string): Promise<AccessRole> {
    const { data, error } = await this.supabase.rpc('admin_get_access_role', { p_role_id: roleId });
    if (error) throw this.toAccessError(error, 'No se pudo cargar el rol seleccionado.');
    if (!isRecord(data))
      throw new AppError('SUPABASE_RPC', 'El servidor devolvió un rol inválido.');
    const value = data as Record<string, Json | undefined>;
    const permissions = this.toPermissions(value['permissions']);
    if (
      typeof value['roleId'] !== 'string' ||
      typeof value['slug'] !== 'string' ||
      typeof value['name'] !== 'string' ||
      typeof value['description'] !== 'string' ||
      typeof value['active'] !== 'boolean' ||
      typeof value['isSystem'] !== 'boolean'
    )
      throw new AppError('SUPABASE_RPC', 'El servidor devolvió un rol inválido.');
    const summary = (await this.listRoles()).find((role) => role.roleId === value['roleId']);
    return {
      roleId: value['roleId'],
      slug: value['slug'],
      name: value['name'],
      description: value['description'],
      active: value['active'],
      isSystem: value['isSystem'],
      assignedUsers: summary?.assignedUsers ?? 0,
      permissions,
    };
  }

  async createRole(input: {
    name: string;
    description: string;
    permissions: AccessPermission[];
    reason: string;
  }): Promise<string> {
    const { data, error } = await this.supabase.rpc('admin_create_access_role', {
      p_name: input.name,
      p_description: input.description,
      p_permission_codes: input.permissions,
      p_reason: input.reason,
    });
    if (error) throw this.toAccessError(error, 'No se pudo crear el rol.');
    if (typeof data !== 'string')
      throw new AppError('SUPABASE_RPC', 'El servidor no confirmó la creación del rol.');
    return data;
  }

  async updateRole(input: {
    roleId: string;
    name: string;
    description: string;
    permissions: AccessPermission[];
    reason: string;
  }): Promise<void> {
    const { error } = await this.supabase.rpc('admin_update_access_role', {
      p_role_id: input.roleId,
      p_name: input.name,
      p_description: input.description,
      p_permission_codes: input.permissions,
      p_reason: input.reason,
    });
    if (error) throw this.toAccessError(error, 'No se pudo actualizar el rol.');
  }

  async setRoleActive(input: { roleId: string; active: boolean; reason: string }): Promise<void> {
    const { error } = await this.supabase.rpc('admin_set_access_role_active', {
      p_role_id: input.roleId,
      p_active: input.active,
      p_reason: input.reason,
    });
    if (error) throw this.toAccessError(error, 'No se pudo cambiar el estado del rol.');
  }

  async listAssignments(): Promise<AccessAssignment[]> {
    const { data, error } = await this.supabase.rpc('admin_list_access_assignments');
    if (error) throw this.toAccessError(error, 'No se pudieron cargar las asignaciones.');
    return (data ?? []).map((row) => ({
      profileId: row.profile_id,
      fullName: row.full_name,
      dni: row.dni,
      baseRole: row.base_role,
      accessRoleId: row.access_role_id,
      accessRoleSlug: row.access_role_slug,
      accessRoleName: row.access_role_name,
    }));
  }

  async assignRole(input: { profileId: string; roleId: string; reason: string }): Promise<void> {
    const { error } = await this.supabase.rpc('admin_assign_access_role', {
      p_profile_id: input.profileId,
      p_role_id: input.roleId,
      p_reason: input.reason,
    });
    if (error) throw this.toAccessError(error, 'No se pudo asignar el rol.');
  }

  async getCollectorSchedule(): Promise<CollectorAccessSchedule> {
    const { data, error } = await this.supabase.rpc('admin_get_collector_access_schedule');
    if (error) throw this.toAccessError(error, 'No se pudo cargar el horario de cobradores.');
    const row = data?.[0];
    if (!row || row.timezone !== 'America/Lima' || row.start_time >= row.end_time) {
      throw new AppError('SUPABASE_RPC', 'El servidor devolvió un horario de acceso inválido.');
    }
    return {
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      timezone: 'America/Lima',
    };
  }

  async updateCollectorSchedule(input: {
    startTime: string;
    endTime: string;
    reason: string;
  }): Promise<void> {
    const { error } = await this.supabase.rpc('admin_update_collector_access_schedule', {
      p_start_time: input.startTime,
      p_end_time: input.endTime,
      p_reason: input.reason,
    });
    if (error) throw this.toAccessError(error, 'No se pudo actualizar el horario de cobradores.');
  }

  private toPermissions(value: Json | undefined): AccessPermission[] {
    if (!Array.isArray(value) || !value.every(isAccessPermission)) {
      throw new AppError('SUPABASE_RPC', 'El servidor devolvió permisos inválidos.');
    }
    return [...value];
  }

  private toAccessError(error: unknown, fallback: string): AppError {
    const code = this.errorField(error, 'code');
    const message = this.errorField(error, 'message');

    // Messages raised by the access-control RPCs, translated for the user.
    const known = KNOWN_ACCESS_ERRORS[message];
    if (known) return new AppError(known.code, known.message, error);

    if (code === '42501') {
      return new AppError(
        'AUTH_UNAUTHORIZED',
        'No tenés permisos para realizar esta acción.',
        error,
      );
    }
    if (code === '22023' || code === '23514') return new AppError('VALIDATION', fallback, error);
    if (code === 'P0002') {
      return new AppError(
        'VALIDATION',
        'El rol o usuario seleccionado ya no está disponible.',
        error,
      );
    }
    if (code.startsWith('08') || message.toLowerCase().includes('fetch')) {
      return new AppError(
        'SUPABASE_CONNECTION',
        'No se pudo conectar con el servidor. Revisá tu conexión e intentá nuevamente.',
        error,
      );
    }
    return new AppError('SUPABASE_RPC', fallback, error);
  }

  private errorField(error: unknown, field: 'code' | 'message'): string {
    if (typeof error !== 'object' || error === null) return '';
    const value = (error as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : '';
  }

  private toContext(value: Json): AccessContext {
    if (!isRecord(value)) {
      throw new AppError('SUPABASE_RPC', 'El servidor devolvió un contexto de permisos inválido.');
    }

    const baseRole = value['baseRole'];
    const accessRole = value['accessRole'];
    const rawPermissions = value['permissions'];
    const updatedAt = value['updatedAt'];
    const operational = value['operational'];

    if (
      (baseRole !== 'admin' && baseRole !== 'supervisor') ||
      !(accessRole === null || typeof accessRole === 'string') ||
      !Array.isArray(rawPermissions) ||
      !rawPermissions.every(isAccessPermission) ||
      !(updatedAt === null || typeof updatedAt === 'string') ||
      typeof operational !== 'boolean'
    ) {
      throw new AppError('SUPABASE_RPC', 'El servidor devolvió un contexto de permisos inválido.');
    }

    return {
      baseRole: baseRole as AdministrativeBaseRole,
      accessRole,
      permissions: rawPermissions,
      updatedAt,
      operational,
    };
  }
}

type KnownAccessError = {
  code: 'VALIDATION' | 'AUTH_UNAUTHORIZED' | 'SUPABASE_RPC';
  message: string;
};

/** Exact messages raised by access_control_rbac and configurable_collector_schedule migrations. */
const KNOWN_ACCESS_ERRORS: Record<string, KnownAccessError> = {
  'A nonblank reason is required': { code: 'VALIDATION', message: 'Ingresá el motivo del cambio.' },
  'Role name is required': { code: 'VALIDATION', message: 'Ingresá un nombre para el rol.' },
  'Permission codes must be unique': {
    code: 'VALIDATION',
    message: 'Hay permisos repetidos en la selección.',
  },
  'Unknown or inactive permission code': {
    code: 'VALIDATION',
    message: 'Alguno de los permisos seleccionados ya no está disponible.',
  },
  'Each action permission requires its module view permission': {
    code: 'VALIDATION',
    message: 'Cada acción requiere también el permiso de visualización de su módulo.',
  },
  'Restricted permissions require the system administrator role': {
    code: 'AUTH_UNAUTHORIZED',
    message: 'Los permisos restringidos no se pueden asignar a roles personalizados.',
  },
  'System roles cannot be modified': {
    code: 'AUTH_UNAUTHORIZED',
    message: 'Los roles reservados no se pueden modificar.',
  },
  'Self assignment is prohibited': {
    code: 'AUTH_UNAUTHORIZED',
    message: 'No podés cambiar tu propia asignación de rol.',
  },
  'The reserved system-administrator role cannot be newly assigned': {
    code: 'AUTH_UNAUTHORIZED',
    message: 'El rol de administrador del sistema no se puede asignar desde esta pantalla.',
  },
  'Only active administrative profiles can be assigned': {
    code: 'AUTH_UNAUTHORIZED',
    message: 'Solo se puede asignar un rol a administradores o supervisores activos.',
  },
  'System administrator access required': {
    code: 'AUTH_UNAUTHORIZED',
    message: 'Solo el administrador del sistema puede realizar este cambio.',
  },
  'Required access permission is missing': {
    code: 'AUTH_UNAUTHORIZED',
    message: 'No tenés permisos para realizar esta acción.',
  },
  'Target access role must be active': {
    code: 'VALIDATION',
    message: 'El rol seleccionado debe estar activo.',
  },
  'An assigned role cannot be deactivated': {
    code: 'VALIDATION',
    message: 'No se puede desactivar un rol que tiene usuarios asignados.',
  },
  'The last system administrator cannot be removed': {
    code: 'VALIDATION',
    message: 'No se puede quitar al último administrador del sistema.',
  },
  'Access role not found': {
    code: 'VALIDATION',
    message: 'El rol o usuario seleccionado ya no está disponible.',
  },
  'Collector access schedule must have valid start and end times': {
    code: 'VALIDATION',
    message: 'La hora de inicio debe ser anterior a la hora de fin.',
  },
  'Collector access schedule is unavailable': {
    code: 'SUPABASE_RPC',
    message: 'El horario de cobradores no está configurado. Contactá a soporte.',
  },
  'Collector access schedule is invalid': {
    code: 'SUPABASE_RPC',
    message: 'El horario de cobradores configurado no es válido. Contactá a soporte.',
  },
};

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
