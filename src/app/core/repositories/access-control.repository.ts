import { InjectionToken } from '@angular/core';
import {
  AccessAssignment,
  AccessContext,
  AccessPermission,
  AccessRole,
  CollectorAccessSchedule,
} from '../models/access-control.model';

export interface AccessControlRepository {
  getCurrentContext(): Promise<AccessContext>;
  listRoles(): Promise<AccessRole[]>;
  getRole(roleId: string): Promise<AccessRole>;
  createRole(input: {
    name: string;
    description: string;
    permissions: AccessPermission[];
    reason: string;
  }): Promise<string>;
  updateRole(input: {
    roleId: string;
    name: string;
    description: string;
    permissions: AccessPermission[];
    reason: string;
  }): Promise<void>;
  setRoleActive(input: { roleId: string; active: boolean; reason: string }): Promise<void>;
  listAssignments(): Promise<AccessAssignment[]>;
  assignRole(input: { profileId: string; roleId: string; reason: string }): Promise<void>;
  getCollectorSchedule(): Promise<CollectorAccessSchedule>;
  updateCollectorSchedule(input: {
    startTime: string;
    endTime: string;
    reason: string;
  }): Promise<void>;
}

export const ACCESS_CONTROL_REPOSITORY = new InjectionToken<AccessControlRepository>(
  'ACCESS_CONTROL_REPOSITORY',
);
