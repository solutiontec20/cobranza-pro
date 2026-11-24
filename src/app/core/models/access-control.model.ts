export const ACCESS_PERMISSION_CODES = [
  'dashboard.view',
  'analytics.view',
  'clients.view',
  'clients.create',
  'clients.update',
  'clients.reassign',
  'clients.deactivate',
  'loans.view',
  'loans.create',
  'loans.update',
  'loans.void',
  'payments.view',
  'payments.register',
  'payments.void',
  'collectors.view',
  'collectors.manage',
  'collectors.reset_pin',
  'daily_control.view',
  'daily_control.export',
  'cash_closure.view',
  'cash_closure.submit',
  'cash_closure.validate',
  'correction_requests.view',
  'correction_requests.resolve',
  'correction_requests.reject',
  'audit.view',
  'roles.view',
  'roles.manage',
] as const;

export type AccessPermission = (typeof ACCESS_PERMISSION_CODES)[number];
export type AdministrativeBaseRole = 'admin' | 'supervisor';

export interface AccessContext {
  baseRole: AdministrativeBaseRole;
  accessRole: string | null;
  permissions: AccessPermission[];
  updatedAt: string | null;
  operational: boolean;
}

export type AccessRole = {
  roleId: string;
  slug: string;
  name: string;
  description: string;
  active: boolean;
  isSystem: boolean;
  assignedUsers: number;
  permissions: AccessPermission[];
};

export type AccessAssignment = {
  profileId: string;
  fullName: string;
  dni: string;
  baseRole: AdministrativeBaseRole | 'collector';
  accessRoleId: string | null;
  accessRoleSlug: string | null;
  accessRoleName: string | null;
};

export type CollectorAccessSchedule = {
  startTime: string;
  endTime: string;
  timezone: 'America/Lima';
};

export type AccessPermissionDefinition = {
  code: AccessPermission;
  module: string;
  label: string;
  description: string;
  risk: 'normal' | 'sensitive' | 'restricted';
  viewCode: AccessPermission | null;
};

export const ACCESS_PERMISSION_CATALOG: readonly AccessPermissionDefinition[] = [
  {
    code: 'dashboard.view',
    module: 'Dashboard',
    label: 'Ver dashboard',
    description: 'Consultar el resumen operativo.',
    risk: 'normal',
    viewCode: null,
  },
  {
    code: 'analytics.view',
    module: 'Analíticas',
    label: 'Ver analíticas',
    description: 'Consultar análisis históricos.',
    risk: 'normal',
    viewCode: null,
  },
  {
    code: 'clients.view',
    module: 'Clientes',
    label: 'Ver clientes',
    description: 'Listar y consultar clientes.',
    risk: 'normal',
    viewCode: null,
  },
  {
    code: 'clients.create',
    module: 'Clientes',
    label: 'Crear clientes',
    description: 'Registrar clientes.',
    risk: 'normal',
    viewCode: 'clients.view',
  },
  {
    code: 'clients.update',
    module: 'Clientes',
    label: 'Editar clientes',
    description: 'Modificar datos de clientes.',
    risk: 'normal',
    viewCode: 'clients.view',
  },
  {
    code: 'clients.reassign',
    module: 'Clientes',
    label: 'Reasignar cartera',
    description: 'Cambiar la titularidad de la cartera.',
    risk: 'sensitive',
    viewCode: 'clients.view',
  },
  {
    code: 'clients.deactivate',
    module: 'Clientes',
    label: 'Desactivar clientes',
    description: 'Desactivar registros de clientes.',
    risk: 'sensitive',
    viewCode: 'clients.view',
  },
  {
    code: 'loans.view',
    module: 'Préstamos',
    label: 'Ver préstamos',
    description: 'Consultar préstamos y saldos.',
    risk: 'normal',
    viewCode: null,
  },
  {
    code: 'loans.create',
    module: 'Préstamos',
    label: 'Crear préstamos',
    description: 'Crear y desembolsar préstamos.',
    risk: 'sensitive',
    viewCode: 'loans.view',
  },
  {
    code: 'loans.update',
    module: 'Préstamos',
    label: 'Editar préstamos',
    description: 'Modificar condiciones del préstamo.',
    risk: 'sensitive',
    viewCode: 'loans.view',
  },
  {
    code: 'loans.void',
    module: 'Préstamos',
    label: 'Anular préstamos',
    description: 'Anular préstamos y revertir sus efectos.',
    risk: 'restricted',
    viewCode: 'loans.view',
  },
  {
    code: 'payments.view',
    module: 'Pagos',
    label: 'Ver pagos',
    description: 'Consultar pagos.',
    risk: 'normal',
    viewCode: null,
  },
  {
    code: 'payments.register',
    module: 'Pagos',
    label: 'Registrar pagos',
    description: 'Registrar pagos de clientes.',
    risk: 'sensitive',
    viewCode: 'payments.view',
  },
  {
    code: 'payments.void',
    module: 'Pagos',
    label: 'Anular pagos',
    description: 'Anular pagos contabilizados.',
    risk: 'restricted',
    viewCode: 'payments.view',
  },
  {
    code: 'collectors.view',
    module: 'Cobradores',
    label: 'Ver cobradores',
    description: 'Consultar perfiles de cobradores.',
    risk: 'normal',
    viewCode: null,
  },
  {
    code: 'collectors.manage',
    module: 'Cobradores',
    label: 'Administrar cobradores',
    description: 'Crear y actualizar cobradores.',
    risk: 'sensitive',
    viewCode: 'collectors.view',
  },
  {
    code: 'collectors.reset_pin',
    module: 'Cobradores',
    label: 'Restablecer PIN',
    description: 'Restablecer credenciales de cobradores.',
    risk: 'restricted',
    viewCode: 'collectors.view',
  },
  {
    code: 'daily_control.view',
    module: 'Control diario',
    label: 'Ver control diario',
    description: 'Consultar el control de cobranza.',
    risk: 'normal',
    viewCode: null,
  },
  {
    code: 'daily_control.export',
    module: 'Control diario',
    label: 'Exportar control diario',
    description: 'Exportar reportes del control diario.',
    risk: 'sensitive',
    viewCode: 'daily_control.view',
  },
  {
    code: 'cash_closure.view',
    module: 'Cierre de caja',
    label: 'Ver cierres de caja',
    description: 'Consultar cierres de caja.',
    risk: 'normal',
    viewCode: null,
  },
  {
    code: 'cash_closure.submit',
    module: 'Cierre de caja',
    label: 'Presentar cierres',
    description: 'Presentar cierres de caja.',
    risk: 'sensitive',
    viewCode: 'cash_closure.view',
  },
  {
    code: 'cash_closure.validate',
    module: 'Cierre de caja',
    label: 'Validar cierres',
    description: 'Validar y bloquear cierres de caja.',
    risk: 'restricted',
    viewCode: 'cash_closure.view',
  },
  {
    code: 'correction_requests.view',
    module: 'Solicitudes',
    label: 'Ver solicitudes',
    description: 'Consultar solicitudes de corrección.',
    risk: 'normal',
    viewCode: null,
  },
  {
    code: 'correction_requests.resolve',
    module: 'Solicitudes',
    label: 'Resolver solicitudes',
    description: 'Aplicar solicitudes aprobadas.',
    risk: 'restricted',
    viewCode: 'correction_requests.view',
  },
  {
    code: 'correction_requests.reject',
    module: 'Solicitudes',
    label: 'Rechazar solicitudes',
    description: 'Rechazar solicitudes de corrección.',
    risk: 'sensitive',
    viewCode: 'correction_requests.view',
  },
  {
    code: 'audit.view',
    module: 'Auditoría',
    label: 'Ver auditoría',
    description: 'Consultar eventos de auditoría.',
    risk: 'sensitive',
    viewCode: null,
  },
  {
    code: 'roles.view',
    module: 'Roles',
    label: 'Ver roles y asignaciones',
    description: 'Consultar configuración de acceso.',
    risk: 'normal',
    viewCode: null,
  },
  {
    code: 'roles.manage',
    module: 'Roles',
    label: 'Administrar roles',
    description: 'Crear roles y cambiar asignaciones.',
    risk: 'restricted',
    viewCode: 'roles.view',
  },
];

export const ACCESS_PERMISSION_GROUPS = ACCESS_PERMISSION_CATALOG.reduce<
  Array<{ module: string; permissions: AccessPermissionDefinition[] }>
>((groups, permission) => {
  const group = groups.find((item) => item.module === permission.module);
  if (group) group.permissions.push(permission);
  else groups.push({ module: permission.module, permissions: [permission] });
  return groups;
}, []);

export function isAccessPermission(value: unknown): value is AccessPermission {
  return typeof value === 'string' && ACCESS_PERMISSION_CODES.includes(value as AccessPermission);
}
