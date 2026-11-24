import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormField, form, maxLength, required, validate } from '@angular/forms/signals';
import { ButtonModule } from 'primeng/button';
import { AccessControlService } from '../../../core/services/access-control.service';
import {
  ACCESS_PERMISSION_CATALOG,
  ACCESS_PERMISSION_GROUPS,
  AccessPermission,
  AccessRole,
} from '../../../core/models/access-control.model';
import { AuthService } from '../../auth/auth.service';
import { AccessControlStore } from './access-control.store';

type Section = 'roles' | 'assignments' | 'schedule';
type RoleFormModel = { name: string; description: string; reason: string };
type ScheduleFormModel = { startTime: string; endTime: string; reason: string };

@Component({
  selector: 'app-access-control',
  imports: [FormField, ButtonModule],
  templateUrl: './access-control.html',
})
export default class AccessControl implements OnInit {
  readonly store = inject(AccessControlStore);
  readonly access = inject(AccessControlService);
  readonly auth = inject(AuthService);
  readonly catalog = ACCESS_PERMISSION_CATALOG;
  readonly groups = ACCESS_PERMISSION_GROUPS;
  readonly canManage = computed(() => this.access.can('roles.manage'));
  readonly activeSection = signal<Section>('roles');
  readonly selectedRoleId = signal<string | null>(null);
  readonly selectedPermissions = signal<AccessPermission[]>([]);
  readonly roleModel = signal<RoleFormModel>({ name: '', description: '', reason: '' });
  readonly roleForm = form(this.roleModel, (path) => {
    required(path.name, { message: 'Ingresá el nombre del rol.' });
    validate(path.name, ({ value }) =>
      value().trim() ? undefined : { kind: 'blankName', message: 'Ingresá un nombre para el rol.' },
    );
    maxLength(path.name, 80, { message: 'El nombre admite hasta 80 caracteres.' });
    maxLength(path.description, 500, { message: 'La descripción admite hasta 500 caracteres.' });
    required(path.reason, { message: 'El motivo es obligatorio.' });
    validate(path.reason, ({ value }) =>
      value().trim()
        ? undefined
        : { kind: 'blankReason', message: 'El motivo no puede estar vacío.' },
    );
    maxLength(path.reason, 1000, { message: 'El motivo admite hasta 1000 caracteres.' });
  });
  readonly selectedRole = computed(
    () => this.store.roles().find((role) => role.roleId === this.selectedRoleId()) ?? null,
  );
  readonly normalizedRolePermissions = computed(() => [...this.selectedPermissions()].sort());
  readonly roleChanged = computed(() => {
    const baseline = this.roleBaseline();
    const model = this.roleModel();
    const permissions = this.normalizedRolePermissions();
    return (
      !baseline ||
      baseline.name !== model.name.trim() ||
      baseline.description !== model.description.trim() ||
      baseline.permissions.join('|') !== permissions.join('|')
    );
  });
  readonly roleBaseline = signal<{
    name: string;
    description: string;
    permissions: AccessPermission[];
  } | null>(null);
  readonly assignmentQuery = signal('');
  readonly selectedProfileId = signal('');
  readonly selectedAssignmentRoleId = signal('');
  readonly assignmentReason = signal('');
  readonly visibleAssignments = computed(() => {
    const query = this.assignmentQuery().trim().toLocaleLowerCase('es-PE');
    return this.store
      .assignments()
      .filter(
        (item) =>
          !query ||
          item.fullName.toLocaleLowerCase('es-PE').includes(query) ||
          item.dni.includes(query),
      );
  });
  readonly chosenAssignment = computed(
    () =>
      this.store.assignments().find((item) => item.profileId === this.selectedProfileId()) ?? null,
  );
  readonly assignmentChanged = computed(
    () =>
      !!this.chosenAssignment() &&
      this.chosenAssignment()?.accessRoleId !== (this.selectedAssignmentRoleId() || null),
  );
  readonly isSelfAssignment = computed(
    () => this.selectedProfileId() === this.auth.currentUser()?.id,
  );
  readonly scheduleModel = signal<ScheduleFormModel>({
    startTime: '07:00',
    endTime: '20:00',
    reason: '',
  });
  readonly scheduleForm = form(this.scheduleModel, (path) => {
    required(path.startTime, { message: 'Ingresá la hora de inicio.' });
    required(path.endTime, { message: 'Ingresá la hora de fin.' });
    required(path.reason, { message: 'El motivo es obligatorio.' });
    validate(path.reason, ({ value }) =>
      value().trim()
        ? undefined
        : { kind: 'blankReason', message: 'El motivo no puede estar vacío.' },
    );
    maxLength(path.reason, 1000, { message: 'El motivo admite hasta 1000 caracteres.' });
    validate(path.endTime, ({ value, valueOf }) => {
      const start = valueOf(path.startTime);
      return start && value() && start >= value()
        ? {
            kind: 'scheduleOrder',
            message: 'La hora de inicio debe ser anterior a la hora de fin.',
          }
        : undefined;
    });
  });
  readonly scheduleChanged = computed(() => {
    const current = this.store.schedule();
    const draft = this.scheduleModel();
    return (
      !!current && (current.startTime !== draft.startTime || current.endTime !== draft.endTime)
    );
  });

  ngOnInit(): void {
    void this.loadData();
  }

  async loadData(): Promise<void> {
    await this.store.initialize(this.canManage());
    const schedule = this.store.schedule();
    if (schedule)
      this.scheduleModel.update((model) => ({
        ...model,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      }));
  }

  async editRole(role: AccessRole): Promise<void> {
    this.store.error.set(null);
    this.store.notice.set(null);
    this.selectedRoleId.set(role.roleId);
    try {
      const detail = await this.store.getRole(role.roleId);
      this.roleModel.set({ name: detail.name, description: detail.description, reason: '' });
      this.selectedPermissions.set(detail.permissions);
      this.roleBaseline.set({
        name: detail.name.trim(),
        description: detail.description.trim(),
        permissions: [...detail.permissions].sort(),
      });
    } catch (error) {
      this.store.error.set(error instanceof Error ? error.message : 'No se pudo cargar el rol.');
    }
  }

  newRole(): void {
    this.store.error.set(null);
    this.store.notice.set(null);
    this.selectedRoleId.set(null);
    this.roleModel.set({ name: '', description: '', reason: '' });
    this.selectedPermissions.set([]);
    this.roleBaseline.set(null);
  }

  setPermission(code: AccessPermission, checked: boolean): void {
    const definition = this.catalog.find((permission) => permission.code === code);
    if (definition?.risk === 'restricted') return;
    this.selectedPermissions.update((permissions) => {
      const next = new Set(permissions);
      if (checked) {
        next.add(code);
        if (definition?.viewCode) next.add(definition.viewCode);
      } else {
        next.delete(code);
        if (definition?.viewCode === null || definition?.viewCode === undefined) {
          for (const item of this.catalog) if (item.viewCode === code) next.delete(item.code);
        }
      }
      return [...next];
    });
  }

  isPermissionChecked(code: AccessPermission): boolean {
    return this.selectedPermissions().includes(code);
  }

  async saveRole(): Promise<void> {
    if (!this.canManage() || !this.roleForm().valid() || !this.roleChanged()) return;
    const model = this.roleModel();
    const input = {
      name: model.name.trim(),
      description: model.description.trim(),
      permissions: this.normalizedRolePermissions(),
      reason: model.reason.trim(),
    };
    const roleId = this.selectedRoleId();
    const success = roleId
      ? await this.store.updateRole({ ...input, roleId })
      : await this.store.createRole(input);
    if (success) {
      this.roleModel.update((current) => ({ ...current, reason: '' }));
      await this.loadData();
      if (!roleId) this.newRole();
      else
        await this.editRole(
          this.store.roles().find((role) => role.roleId === roleId) ?? this.store.roles()[0],
        );
    }
  }

  async toggleRoleActive(role: AccessRole): Promise<void> {
    if (!this.canManage() || role.isSystem) return;
    const active = !role.active;
    const action = active ? 'activar' : 'desactivar';
    if (
      !window.confirm(
        `¿Querés ${action} el rol “${role.name}”? Los usuarios afectados deberán iniciar sesión nuevamente.`,
      )
    )
      return;
    const reason = window.prompt(`Motivo para ${action} el rol (obligatorio):`)?.trim() ?? '';
    if (!reason) return;
    await this.store.setRoleActive({ roleId: role.roleId, active, reason });
  }

  selectAssignment(profileId: string): void {
    this.selectedProfileId.set(profileId);
    const row = this.store.assignments().find((item) => item.profileId === profileId);
    this.selectedAssignmentRoleId.set(row?.accessRoleId ?? '');
    this.assignmentReason.set('');
  }

  ensureAssignmentSelected(profileId: string): void {
    if (this.selectedProfileId() !== profileId) this.selectAssignment(profileId);
  }

  changeAssignmentRole(profileId: string, roleId: string): void {
    this.ensureAssignmentSelected(profileId);
    this.selectedAssignmentRoleId.set(roleId);
  }

  async saveAssignment(): Promise<void> {
    const row = this.chosenAssignment();
    const reason = this.assignmentReason().trim();
    if (
      !this.canManage() ||
      !row ||
      !this.assignmentChanged() ||
      !this.selectedAssignmentRoleId() ||
      !reason ||
      this.isSelfAssignment()
    )
      return;
    const selected = this.store
      .roles()
      .find((role) => role.roleId === this.selectedAssignmentRoleId());
    if (!selected?.active || selected.slug === 'system_administrator') return;
    const saved = await this.store.assignRole({
      profileId: row.profileId,
      roleId: selected.roleId,
      reason,
    });
    if (saved) this.selectAssignment(row.profileId);
  }

  async saveSchedule(): Promise<void> {
    const model = this.scheduleModel();
    if (!this.canManage() || !this.scheduleForm().valid() || !this.scheduleChanged()) return;
    const saved = await this.store.updateSchedule({
      startTime: model.startTime,
      endTime: model.endTime,
      reason: model.reason.trim(),
    });
    if (saved) this.scheduleModel.update((current) => ({ ...current, reason: '' }));
  }

  baseRoleLabel(role: string): string {
    return (
      { admin: 'Administrador', supervisor: 'Supervisor', collector: 'Cobrador' }[role] ?? role
    );
  }
}
