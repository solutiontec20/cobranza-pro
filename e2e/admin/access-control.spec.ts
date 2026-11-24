import { expect, Page, test } from '@playwright/test';
import { AccessPermission } from '../../src/app/core/models/access-control.model';
import { prepareResponsiveSmoke, SmokeProfile } from '../support/responsive-smoke';

const adminProfile: SmokeProfile = {
  id: 'admin-roles-smoke',
  dni: '10000001',
  fullName: 'Admin Roles',
  role: 'admin',
  active: true,
  mustChangePin: false,
};

const supervisorProfile: SmokeProfile = {
  id: 'supervisor-roles-smoke',
  dni: '10000002',
  fullName: 'Supervisor Roles',
  role: 'supervisor',
  active: true,
  mustChangePin: false,
};

const READER_ROLE_ID = '11111111-1111-4111-8111-111111111111';

const rolesRows = [
  {
    role_id: '22222222-2222-4222-8222-222222222222',
    slug: 'system_administrator',
    name: 'System administrator',
    description: 'Reserved full-access role.',
    active: true,
    is_system: true,
    assigned_users: 1,
    permissions: ['dashboard.view', 'clients.view', 'roles.view', 'roles.manage'],
  },
  {
    role_id: READER_ROLE_ID,
    slug: 'custom_reader_1a2b3c4d',
    name: 'Lector de clientes',
    description: 'Solo consulta',
    active: true,
    is_system: false,
    assigned_users: 0,
    permissions: ['clients.view'],
  },
];

interface Calls {
  create: Array<Record<string, unknown>>;
  schedule: Array<Record<string, unknown>>;
  assign: Array<Record<string, unknown>>;
}

/** Answers every access-control RPC the screen uses and records the mutations it performs. */
async function stubAccessControl(page: Page): Promise<Calls> {
  const calls: Calls = { create: [], schedule: [], assign: [] };
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route('**/rest/v1/rpc/admin_list_access_roles', (route) =>
    route.fulfill(json(rolesRows)),
  );
  await page.route('**/rest/v1/rpc/admin_list_access_assignments', (route) =>
    route.fulfill(
      json([
        {
          profile_id: 'supervisor-roles-smoke',
          full_name: 'Sofía Supervisora',
          dni: '10000002',
          base_role: 'supervisor',
          access_role_id: '33333333-3333-4333-8333-333333333333',
          access_role_slug: 'supervisor_default',
          access_role_name: 'Default supervisor',
        },
      ]),
    ),
  );
  await page.route('**/rest/v1/rpc/admin_get_collector_access_schedule', (route) =>
    route.fulfill(
      json([{ start_time: '07:00:00', end_time: '20:00:00', timezone: 'America/Lima' }]),
    ),
  );
  await page.route('**/rest/v1/rpc/admin_create_access_role', async (route) => {
    calls.create.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill(json('44444444-4444-4444-8444-444444444444'));
  });
  await page.route('**/rest/v1/rpc/admin_update_collector_access_schedule', async (route) => {
    calls.schedule.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill(json(null));
  });
  await page.route('**/rest/v1/rpc/admin_assign_access_role', async (route) => {
    calls.assign.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill(json(null));
  });

  return calls;
}

test.describe('roles y permisos', () => {
  test('el administrador del sistema ve roles, asignaciones y horario', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = await prepareResponsiveSmoke(page, adminProfile);
    await stubAccessControl(page);

    await page.goto('/admin/roles');

    await expect(page.getByRole('heading', { name: 'Roles y permisos', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lector de clientes', level: 3 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear un rol personalizado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Horario de cobradores' })).toBeVisible();

    await page.getByRole('button', { name: 'Asignaciones' }).click();
    await expect(page.getByRole('heading', { name: 'Asignaciones de acceso' })).toBeVisible();
    await expect(page.getByText('Sofía Supervisora')).toBeVisible();

    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });

  test('al elegir una acción se marca su consulta y el rol se crea con motivo', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareResponsiveSmoke(page, adminProfile);
    const calls = await stubAccessControl(page);

    await page.goto('/admin/roles');
    await page.getByRole('button', { name: 'Crear un rol personalizado' }).click();

    const save = page.getByRole('button', { name: 'Guardar cambios' });
    await expect(save).toBeDisabled();

    await page.getByLabel('Nombre del rol').fill('Operador de clientes');
    await page.getByRole('checkbox', { name: /Crear clientes/ }).check();

    // The dependent view permission is selected automatically.
    await expect(page.getByRole('checkbox', { name: /Ver clientes/ })).toBeChecked();
    // Restricted permissions are never assignable.
    await expect(page.getByRole('checkbox', { name: /Anular préstamos/ })).toBeDisabled();
    await expect(save).toBeDisabled(); // reason still missing

    await page.getByLabel('Motivo del cambio').fill('Nuevo operador de atención');
    await expect(save).toBeEnabled();
    await save.click();

    await expect.poll(() => calls.create.length).toBe(1);
    expect(calls.create[0]['p_name']).toBe('Operador de clientes');
    expect(calls.create[0]['p_reason']).toBe('Nuevo operador de atención');
    expect([...(calls.create[0]['p_permission_codes'] as string[])].sort()).toEqual([
      'clients.create',
      'clients.view',
    ]);
  });

  test('el horario solo se guarda con un cambio real y un motivo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareResponsiveSmoke(page, adminProfile);
    const calls = await stubAccessControl(page);

    await page.goto('/admin/roles');
    await page.getByRole('button', { name: 'Horario de cobradores' }).click();

    await expect(page.getByLabel('Inicio (incluyente)')).toHaveValue('07:00');
    await expect(page.getByLabel('Fin (excluyente)')).toHaveValue('20:00');
    await expect(page.getByText('America/Lima').first()).toBeVisible();

    const save = page.getByRole('button', { name: /Guardar horario/ });
    await expect(save).toBeDisabled();

    // A reason alone is not a change.
    await page.getByLabel('Motivo del cambio').fill('Nuevo turno de cobranza');
    await expect(save).toBeDisabled();

    await page.getByLabel('Inicio (incluyente)').fill('08:00');
    await page.getByLabel('Fin (excluyente)').fill('17:00');
    await expect(save).toBeEnabled();
    await save.click();

    await expect.poll(() => calls.schedule.length).toBe(1);
    expect(calls.schedule[0]).toMatchObject({
      p_start_time: '08:00',
      p_end_time: '17:00',
      p_reason: 'Nuevo turno de cobranza',
    });
  });

  test('un supervisor por defecto consulta roles pero no puede administrarlos', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareResponsiveSmoke(page, supervisorProfile);
    await stubAccessControl(page);

    await page.goto('/admin/roles');

    await expect(page.getByRole('heading', { name: 'Roles y permisos', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lector de clientes', level: 3 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear un rol personalizado' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Horario de cobradores' })).toHaveCount(0);
  });

  test.describe('un rol limitado', () => {
    const limited: AccessPermission[] = ['dashboard.view', 'clients.view'];

    test('solo ve los módulos permitidos y las demás rutas llevan a "Sin acceso"', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await prepareResponsiveSmoke(page, adminProfile, { accessPermissions: limited });

      await page.goto('/admin/dashboard');
      const nav = page.getByRole('navigation', { name: 'Navegación principal' });

      await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Clientes' })).toBeVisible();
      for (const hidden of [
        'Préstamos',
        'Cobradores',
        'Cierre de caja',
        'Solicitudes',
        'Roles y permisos',
      ]) {
        await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
      }

      await page.goto('/admin/prestamos');

      await expect(page).toHaveURL(/\/admin\/sin-acceso$/);
      await expect(page.getByRole('heading', { name: 'Sin acceso' })).toBeVisible();
      await expect(page.getByTestId('access-denied-landing')).toHaveText(/Ir al dashboard/);
    });

    test('no puede abrir la administración de roles escribiendo la dirección', async ({ page }) => {
      await prepareResponsiveSmoke(page, adminProfile, { accessPermissions: limited });
      await stubAccessControl(page);

      await page.goto('/admin/roles');

      await expect(page).toHaveURL(/\/admin\/sin-acceso$/);
    });
  });

  for (const viewport of [
    { name: 'mobile', width: 360, height: 800 },
    { name: 'tablet', width: 768, height: 1024 },
  ]) {
    test(`${viewport.name}: la pantalla de roles no genera overflow horizontal`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await prepareResponsiveSmoke(page, adminProfile);
      await stubAccessControl(page);

      await page.goto('/admin/roles');
      await expect(page.getByRole('heading', { name: 'Roles y permisos', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Crear un rol personalizado' }).click();
      await expect(page.getByRole('checkbox', { name: /Ver clientes/ })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
