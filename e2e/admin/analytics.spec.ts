import { expect, Page, test } from '@playwright/test';
import { prepareResponsiveSmoke, SmokeProfile } from '../support/responsive-smoke';

const adminProfile: SmokeProfile = {
  id: 'admin-analytics-smoke',
  dni: '10000001',
  fullName: 'Admin Analíticas',
  role: 'admin',
  active: true,
  mustChangePin: false,
};

const collectorProfile: SmokeProfile = {
  id: 'collector-analytics-smoke',
  dni: '20000001',
  fullName: 'Marco Analíticas',
  role: 'collector',
  active: true,
  mustChangePin: false,
};

interface SeriesCall {
  p_start: string;
  p_end: string;
  p_bucket: string;
  p_collector_id?: string | null;
}

interface CollectorsCall {
  p_start: string;
  p_end: string;
  p_collector_id?: string | null;
}

interface Recorded {
  series: SeriesCall[];
  collectors: CollectorsCall[];
  categories: CollectorsCall[];
  any: string[];
}

interface Scenario {
  series: Array<Record<string, unknown>>;
  collectors: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
}

const activeDay: Scenario = {
  series: [
    {
      bucket_start: '2026-11-22',
      bucket_end: '2026-11-22',
      collected_amount: 120,
      interest_collected: 20,
      loan_disbursements: 100,
      operating_expenses: 5,
      net_profit: 15,
      payments_count: 2,
    },
  ],
  collectors: [
    {
      collector_id: 'collector-1',
      collector_name: 'Ana Torres',
      collector_dni: '87654321',
      collected_amount: 90,
      interest_collected: 15,
      payments_count: 1,
      clients_attended: 1,
      loan_disbursements: 100,
      operating_expenses: 5,
      net_profit: 10,
    },
    {
      collector_id: 'collector-2',
      collector_name: 'Luis Pérez',
      collector_dni: '76543210',
      collected_amount: 30,
      interest_collected: 5,
      payments_count: 1,
      clients_attended: 1,
      loan_disbursements: 0,
      operating_expenses: 0,
      net_profit: 5,
    },
  ],
  categories: [{ category: 'fuel', expense_count: 1, spent_amount: 5 }],
};

const quietDay: Scenario = {
  series: [
    {
      bucket_start: '2026-11-22',
      bucket_end: '2026-11-22',
      collected_amount: 0,
      interest_collected: 0,
      loan_disbursements: 0,
      operating_expenses: 0,
      net_profit: 0,
      payments_count: 0,
    },
  ],
  collectors: [],
  categories: [],
};

/** Answers the three analytics RPCs and records every call they receive. */
async function stubAnalytics(page: Page, scenario: Scenario): Promise<Recorded> {
  const recorded: Recorded = { series: [], collectors: [], categories: [], any: [] };

  const fulfil = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route('**/rest/v1/rpc/admin_analytics_series', async (route) => {
    recorded.series.push(route.request().postDataJSON() as SeriesCall);
    recorded.any.push('series');
    await route.fulfill(fulfil(scenario.series));
  });
  await page.route('**/rest/v1/rpc/admin_analytics_collectors', async (route) => {
    recorded.collectors.push(route.request().postDataJSON() as CollectorsCall);
    recorded.any.push('collectors');
    await route.fulfill(fulfil(scenario.collectors));
  });
  await page.route('**/rest/v1/rpc/admin_analytics_expense_categories', async (route) => {
    recorded.categories.push(route.request().postDataJSON() as CollectorsCall);
    recorded.any.push('categories');
    await route.fulfill(fulfil(scenario.categories));
  });
  await page.route('**/rest/v1/profiles?*', async (route) => {
    await route.fulfill(
      fulfil([
        { id: 'collector-1', full_name: 'Ana Torres' },
        { id: 'collector-2', full_name: 'Luis Pérez' },
      ]),
    );
  });

  return recorded;
}

const last = <T>(items: T[]): T => items[items.length - 1];

test.describe('analíticas', () => {
  test('el dashboard no consulta analíticas y Analíticas se abre desde el menú', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = await prepareResponsiveSmoke(page, adminProfile);
    const recorded = await stubAnalytics(page, activeDay);

    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard general' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(recorded.any, 'el dashboard no debe pedir analíticas').toEqual([]);
    await expect(page.getByRole('link', { name: 'Ver análisis detallado' })).toBeVisible();

    await page.getByRole('link', { name: 'Analíticas', exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/analiticas$/);
    await expect(page.getByRole('heading', { name: 'Analíticas', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rendimiento por cobrador' })).toBeVisible();
    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });

  test('por defecto muestra solo el día de hoy, no el mes completo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepareResponsiveSmoke(page, adminProfile);
    const recorded = await stubAnalytics(page, activeDay);

    await page.goto('/admin/analiticas');
    await expect(page.getByTestId('analytics-range')).toBeVisible();

    await expect.poll(() => recorded.series.length).toBeGreaterThan(0);
    const call = recorded.series[0];
    expect(call.p_start).toBe(call.p_end);
    expect(call.p_bucket).toBe('day');
    expect(call.p_collector_id ?? null).toBeNull();
  });

  test('un día sin cobranza muestra el estado vacío y no cifras de otros días', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepareResponsiveSmoke(page, adminProfile);
    await stubAnalytics(page, quietDay);

    await page.goto('/admin/analiticas');

    await expect(page.getByTestId('analytics-empty')).toBeVisible();
    await expect(page.getByTestId('kpi-net-profit')).toHaveCount(0);
  });

  test('semana, mes y año consultan exactamente su rango', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepareResponsiveSmoke(page, adminProfile);
    const recorded = await stubAnalytics(page, activeDay);

    await page.goto('/admin/analiticas');
    await expect(page.getByTestId('analytics-range')).toBeVisible();

    await page.locator('input[type="date"]').first().fill('2026-11-22');
    await expect.poll(() => last(recorded.series)?.p_start).toBe('2026-11-22');
    expect(last(recorded.series).p_end).toBe('2026-11-22');

    await page.getByRole('button', { name: 'Semana' }).click();
    await expect.poll(() => last(recorded.series).p_start).toBe('2026-11-16');
    expect(last(recorded.series).p_end).toBe('2026-11-22');
    await expect(page.getByTestId('analytics-range')).toContainText('16/11/2026 – 22/11/2026');

    await page.getByRole('button', { name: 'Mes' }).click();
    await expect.poll(() => last(recorded.series).p_start).toBe('2026-11-01');
    expect(last(recorded.series).p_end).toBe('2026-11-30');

    await page.getByRole('button', { name: 'Año' }).click();
    await expect.poll(() => last(recorded.series).p_start).toBe('2026-01-01');
    expect(last(recorded.series).p_end).toBe('2026-12-31');
    expect(last(recorded.series).p_bucket).toBe('week');
  });

  test('un rango personalizado consulta sus fechas y rechaza uno invertido', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepareResponsiveSmoke(page, adminProfile);
    const recorded = await stubAnalytics(page, activeDay);

    await page.goto('/admin/analiticas');
    await page.locator('input[type="date"]').first().fill('2026-11-22');
    await page.getByRole('button', { name: 'Rango' }).click();

    await page.getByLabel('Desde').fill('2026-11-01');
    await page.getByLabel('Hasta').fill('2026-11-10');

    await expect
      .poll(() => `${last(recorded.series).p_start}|${last(recorded.series).p_end}`)
      .toBe('2026-11-01|2026-11-10');
    await expect(page.getByTestId('analytics-range')).toContainText('01/11/2026 – 10/11/2026');
    await expect(page.getByRole('button', { name: 'Ver período siguiente' })).toHaveCount(0);

    const callsBefore = recorded.series.length;
    await page.getByLabel('Hasta').fill('2026-10-01');

    await expect(
      page.getByText('La fecha final no puede ser anterior a la inicial.'),
    ).toBeVisible();
    expect(recorded.series.length).toBe(callsBefore);
    await expect(page.getByLabel('Hasta')).toHaveValue('2026-11-10');
  });

  test('elegir un cobrador filtra su cobranza y mantiene la comparación', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prepareResponsiveSmoke(page, adminProfile);
    const recorded = await stubAnalytics(page, activeDay);

    await page.goto('/admin/analiticas');
    const table = page.getByTestId('collectors-table');
    await expect(table.getByRole('row', { name: /Ana Torres/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /Luis Pérez/ })).toBeVisible();
    const collectorCallsBefore = recorded.collectors.length;

    await table.getByRole('button', { name: 'Ver solo a Ana Torres' }).click();

    await expect.poll(() => last(recorded.series).p_collector_id).toBe('collector-1');
    expect(last(recorded.categories).p_collector_id).toBe('collector-1');
    expect(recorded.collectors.length, 'comparar cobradores no depende del filtro').toBe(
      collectorCallsBefore,
    );
    await expect(page.getByText('Solo el cobrador Ana Torres.')).toBeVisible();
    await expect(table.getByRole('row', { name: /Luis Pérez/ })).toBeVisible();

    await table.getByRole('button', { name: 'Quitar filtro de Ana Torres' }).click();
    await expect.poll(() => last(recorded.series).p_collector_id ?? null).toBeNull();
  });

  test('un cobrador no puede abrir Analíticas ni consulta datos', async ({ page }) => {
    await prepareResponsiveSmoke(page, collectorProfile);
    const recorded = await stubAnalytics(page, activeDay);

    await page.goto('/admin/analiticas');

    await expect(page).toHaveURL(/\/cobrador\/?$/);
    expect(recorded.any).toEqual([]);
  });

  for (const viewport of [
    { name: 'mobile', width: 360, height: 800 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 800 },
  ]) {
    test(`${viewport.name}: no genera overflow horizontal`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await prepareResponsiveSmoke(page, adminProfile);
      await stubAnalytics(page, activeDay);

      await page.goto('/admin/analiticas');
      await expect(page.getByRole('heading', { name: 'Rendimiento por cobrador' })).toBeVisible();
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
