import { test } from '@playwright/test';
import {
  expectResponsiveRoutes,
  prepareResponsiveSmoke,
  responsiveViewports,
  ResponsiveSmokeRoute,
  SmokeProfile,
} from '../support/responsive-smoke';

const adminProfile: SmokeProfile = {
  id: 'admin-responsive-smoke',
  dni: '10000001',
  fullName: 'Admin Responsive',
  role: 'admin',
  active: true,
  mustChangePin: false,
};

const collectorProfile: SmokeProfile = {
  id: 'collector-responsive-smoke',
  dni: '20000001',
  fullName: 'Marco Responsive',
  role: 'collector',
  active: true,
  mustChangePin: false,
};

const forcedPinProfile: SmokeProfile = {
  ...collectorProfile,
  id: 'forced-pin-responsive-smoke',
  mustChangePin: true,
};

const publicRoutes: readonly ResponsiveSmokeRoute[] = [
  { name: 'login', path: '/login', heading: 'Bienvenido' },
];

const adminRoutes: readonly ResponsiveSmokeRoute[] = [
  { name: 'dashboard', path: '/admin/dashboard', heading: 'Dashboard general' },
  { name: 'clientes', path: '/admin/clientes', heading: 'Clientes' },
  { name: 'préstamos', path: '/admin/prestamos', heading: 'Préstamos' },
  { name: 'cobradores', path: '/admin/cobradores', heading: 'Cobradores' },
  { name: 'control diario', path: '/admin/control-diario', heading: 'Control diario' },
  { name: 'cierre de caja', path: '/admin/cierre-caja', heading: 'Cierre de caja' },
  { name: 'auditoría', path: '/admin/auditoria', text: 'En construcción' },
];

const collectorRoutes: readonly ResponsiveSmokeRoute[] = [
  {
    name: 'ruta de cobranza',
    path: '/cobrador',
    heading: /Ruta de cobranza de/,
  },
  { name: 'clientes del cobrador', path: '/cobrador/clientes', heading: 'Mis Clientes' },
];

const forcedPinRoutes: readonly ResponsiveSmokeRoute[] = [
  { name: 'cambio obligatorio de PIN', path: '/cambiar-pin', heading: 'Cambiar PIN' },
];

test.describe('smoke responsive reutilizable por rutas', () => {
  for (const viewport of responsiveViewports) {
    test(`${viewport.name}: rutas públicas`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const errors = await prepareResponsiveSmoke(page, null);
      await expectResponsiveRoutes(page, publicRoutes, errors);
    });

    test(`${viewport.name}: rutas administrativas`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const errors = await prepareResponsiveSmoke(page, adminProfile);
      await expectResponsiveRoutes(page, adminRoutes, errors);
    });

    test(`${viewport.name}: rutas del cobrador`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const errors = await prepareResponsiveSmoke(page, collectorProfile);
      await expectResponsiveRoutes(page, collectorRoutes, errors);
    });

    test(`${viewport.name}: cambio obligatorio de PIN`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const errors = await prepareResponsiveSmoke(page, forcedPinProfile);
      await expectResponsiveRoutes(page, forcedPinRoutes, errors);
    });
  }
});
