import { computed, inject, Injectable, signal } from '@angular/core';
import { AppError } from '../../../core/errors/app-error';
import {
  AccessAssignment,
  AccessPermission,
  AccessRole,
  CollectorAccessSchedule,
} from '../../../core/models/access-control.model';
import { ACCESS_CONTROL_REPOSITORY } from '../../../core/repositories/access-control.repository';

@Injectable()
export class AccessControlStore {
  private readonly repository = inject(ACCESS_CONTROL_REPOSITORY);

  readonly roles = signal<AccessRole[]>([]);
  readonly assignments = signal<AccessAssignment[]>([]);
  readonly schedule = signal<CollectorAccessSchedule | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly hasSchedule = computed(() => this.schedule() !== null);

  async initialize(canManage: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const tasks: Promise<unknown>[] = [
      this.repository.listRoles().then((roles) => this.roles.set(roles)),
      this.repository.listAssignments().then((assignments) => this.assignments.set(assignments)),
    ];
    if (canManage)
      tasks.push(
        this.repository.getCollectorSchedule().then((schedule) => this.schedule.set(schedule)),
      );
    try {
      await Promise.all(tasks);
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo cargar la configuración de acceso.'));
    } finally {
      this.loading.set(false);
    }
  }

  async getRole(roleId: string): Promise<AccessRole> {
    return this.repository.getRole(roleId);
  }

  async createRole(input: {
    name: string;
    description: string;
    permissions: AccessPermission[];
    reason: string;
  }): Promise<boolean> {
    return this.mutate(async () => {
      await this.repository.createRole(input);
      await this.repository.listRoles().then((roles) => this.roles.set(roles));
      this.notice.set(
        'El rol se creó correctamente. Los cambios de acceso requieren iniciar sesión nuevamente.',
      );
    });
  }

  async updateRole(input: {
    roleId: string;
    name: string;
    description: string;
    permissions: AccessPermission[];
    reason: string;
  }): Promise<boolean> {
    return this.mutate(async () => {
      await this.repository.updateRole(input);
      await this.repository.listRoles().then((roles) => this.roles.set(roles));
      this.notice.set(
        'El rol se actualizó correctamente. Los usuarios afectados deberán iniciar sesión nuevamente.',
      );
    });
  }

  async setRoleActive(input: {
    roleId: string;
    active: boolean;
    reason: string;
  }): Promise<boolean> {
    return this.mutate(async () => {
      await this.repository.setRoleActive(input);
      await this.repository.listRoles().then((roles) => this.roles.set(roles));
      this.notice.set(
        'El estado del rol se actualizó. Los usuarios afectados deberán iniciar sesión nuevamente.',
      );
    });
  }

  async assignRole(input: { profileId: string; roleId: string; reason: string }): Promise<boolean> {
    return this.mutate(async () => {
      await this.repository.assignRole(input);
      const [roles, assignments] = await Promise.all([
        this.repository.listRoles(),
        this.repository.listAssignments(),
      ]);
      this.roles.set(roles);
      this.assignments.set(assignments);
      this.notice.set('La asignación se actualizó. El usuario deberá iniciar sesión nuevamente.');
    });
  }

  async updateSchedule(input: {
    startTime: string;
    endTime: string;
    reason: string;
  }): Promise<boolean> {
    return this.mutate(async () => {
      await this.repository.updateCollectorSchedule(input);
      this.schedule.set(await this.repository.getCollectorSchedule());
      this.notice.set(
        'El horario se actualizó. Los cobradores activos deberán iniciar sesión nuevamente.',
      );
    });
  }

  private async mutate(operation: () => Promise<void>): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await operation();
      return true;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No se pudo guardar el cambio.'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private messageFrom(error: unknown, fallback: string): string {
    return AppError.from(error, 'SUPABASE_RPC').message || fallback;
  }
}
