import { expect, Page, test } from '@playwright/test';

export const responsiveViewports = [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

export interface SmokeProfile {
  id: string;
  dni: string;
  fullName: string;
  role: 'admin' | 'supervisor' | 'collector';
  active: boolean;
  mustChangePin: boolean;
}

export interface ResponsiveSmokeRoute {
  name: string;
  path: string;
  heading?: string | RegExp;
  text?: string;
}

interface BrowserErrors {
  console: string[];
  page: string[];
}

export async function prepareResponsiveSmoke(
  page: Page,
  profile: SmokeProfile | null,
): Promise<BrowserErrors> {
  await page.addInitScript((storedProfile) => {
    if (storedProfile) {
      localStorage.setItem('cobranzapro_user', JSON.stringify(storedProfile));
    } else {
      localStorage.removeItem('cobranzapro_user');
    }
  }, profile);

  await page.route('**/rest/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith('/rpc/admin_dashboard_summary')
      ? [
          {
            capital_prestado: 1000,
            total_esperado: 1200,
            total_cobrado: 500,
            saldo_pendiente: 700,
            total_clientes: 10,
            prestamos_pagados: 2,
            cobradores: 0,
            risk_green: 6,
            risk_yellow: 2,
            risk_orange: 1,
            risk_red: 1,
          },
        ]
      : [];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '*/0' },
      body: JSON.stringify(body),
    });
  });

  const errors: BrowserErrors = { console: [], page: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', (error) => errors.page.push(error.message));
  return errors;
}

export async function expectResponsiveRoutes(
  page: Page,
  routes: readonly ResponsiveSmokeRoute[],
  errors: BrowserErrors,
): Promise<void> {
  for (const route of routes) {
    await test.step(route.name, async () => {
      errors.console.length = 0;
      errors.page.length = 0;

      const response = await page.goto(route.path);
      expect(response, `${route.path} debe devolver una respuesta`).not.toBeNull();
      expect(response?.ok(), `${route.path} debe cargar correctamente`).toBe(true);

      if (route.heading) {
        await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
      } else if (route.text) {
        await expect(page.getByText(route.text, { exact: true }).first()).toBeVisible();
      }

      await page.waitForLoadState('networkidle');

      const viewport = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(
        viewport.scrollWidth,
        `${route.path} no debe generar overflow horizontal global`,
      ).toBeLessThanOrEqual(viewport.clientWidth + 1);
      expect(errors.page, `${route.path} no debe lanzar errores de página`).toEqual([]);
      expect(errors.console, `${route.path} no debe registrar errores de consola`).toEqual([]);
    });
  }
}
