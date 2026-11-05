import { expect, Page, test } from '@playwright/test';

const viewports = [
  { name: 'Samsung S21', width: 360, height: 800 },
  { name: 'mobile grande', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'antes de lg', width: 1023, height: 800 },
  { name: 'inicio de lg', width: 1024, height: 800 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'desktop amplio', width: 1440, height: 900 },
] as const;

test.describe('rendimiento de cobradores responsive', () => {
  for (const viewport of viewports) {
    test(`${viewport.name}: muestra la variante correcta`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await prepareDashboard(page);

      const heading = page.getByRole('heading', { name: 'Rendimiento de cobradores' });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();

      const card = heading.locator('xpath=ancestor::p-card[1]');
      await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      const mobileCards = card.getByTestId('collector-performance-mobile');
      const desktopTable = card.getByTestId('collector-performance-desktop');

      if (viewport.width < 1024) {
        await expect(mobileCards).toBeVisible();
        await expect(mobileCards.getByText('Ana Torres', { exact: true })).toBeVisible();
        await expect(desktopTable).toHaveCount(0);
      } else {
        await expect(mobileCards).toHaveCount(0);
        await expect(desktopTable).toBeVisible();
        await expect(desktopTable.getByRole('columnheader', { name: 'Cobrador' })).toBeVisible();
        await expect(desktopTable.getByText('Ana Torres', { exact: true })).toBeVisible();
        await expect(desktopTable.locator('tbody tr')).toHaveCount(2);
      }

      const hasGlobalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(hasGlobalOverflow).toBe(false);
    });
  }

  for (const scenario of [
    { name: 'mobile', viewport: { width: 360, height: 800 }, result: 'cards' },
    { name: 'desktop', viewport: { width: 1280, height: 800 }, result: 'table' },
  ] as const) {
    test(`${scenario.name}: abre la cartera y conserva el filtro en la URL`, async ({ page }) => {
      await page.setViewportSize(scenario.viewport);
      await prepareDashboard(page);
      await mockClientPortfolio(page);

      const heading = page.getByRole('heading', { name: 'Rendimiento de cobradores' });
      const card = heading.locator('xpath=ancestor::p-card[1]');
      await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));

      const variant =
        scenario.result === 'cards'
          ? card.getByTestId('collector-performance-mobile')
          : card.getByTestId('collector-performance-desktop');
      await variant.getByRole('link', { name: 'Ver cartera' }).first().click();

      await expect(page).toHaveURL(/\/admin\/clientes\?collectorId=collector-1$/);
      const collectorFilter = page.getByRole('combobox', { name: 'Cobrador' });
      await expect(collectorFilter).toHaveValue('collector-1');

      const clients = page.locator(
        scenario.result === 'cards' ? 'main div.divide-y.divide-surface' : 'main div.hidden.overflow-x-auto',
      );
      await expect(clients.getByText('Cliente Ana', { exact: true })).toBeVisible();
      await expect(clients.getByText('Cliente Luis', { exact: true })).toHaveCount(0);

      await collectorFilter.selectOption('');
      await expect(page).toHaveURL(/\/admin\/clientes\/?$/);
      await expect(clients.getByText('Cliente Luis', { exact: true })).toBeVisible();
    });
  }
});

async function prepareDashboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'cobranzapro_user',
      JSON.stringify({
        id: 'admin-test',
        dni: '12345678',
        fullName: 'Administrador de prueba',
        role: 'admin',
        active: true,
        mustChangePin: false,
      }),
    );
  });

  await page.route('**/rest/v1/rpc/admin_dashboard_summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          capital_prestado: 1000,
          total_esperado: 1200,
          total_cobrado: 500,
          saldo_pendiente: 700,
          total_clientes: 10,
          prestamos_pagados: 2,
          cobradores: 2,
          risk_green: 4,
          risk_yellow: 3,
          risk_orange: 2,
          risk_red: 1,
        },
      ]),
    });
  });

  await page.route('**/rest/v1/rpc/admin_dashboard_collector_performance', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          collector_id: 'collector-1',
          collector_name: 'Ana Torres',
          collector_dni: '87654321',
          clients_count: 5,
          expected_today: 100,
          collected_today: 80,
          pending_today: 20,
          delayed_count: 1,
        },
        {
          collector_id: 'collector-2',
          collector_name: 'Luis Pérez',
          collector_dni: '76543210',
          clients_count: 5,
          expected_today: 120,
          collected_today: 120,
          pending_today: 0,
          delayed_count: 0,
        },
      ]),
    });
  });

  const response = await page.goto('/admin/dashboard');
  expect(response).not.toBeNull();
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/admin\/dashboard\/?$/);
}

async function mockClientPortfolio(page: Page): Promise<void> {
  await page.route('**/rest/v1/customers?*', async (route) => {
    const collectorFilter = new URL(route.request().url()).searchParams.get('collector_id');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'client-1',
          document_number: '70000001',
          full_name: 'Cliente Ana',
          phone: '900000001',
          address: 'Dirección 1',
          notes: null,
          collector_id: 'collector-1',
          active: true,
          created_at: '2026-10-30T12:00:00.000Z',
          collector: { full_name: 'Ana Torres' },
        },
        {
          id: 'client-2',
          document_number: '70000002',
          full_name: 'Cliente Luis',
          phone: '900000002',
          address: 'Dirección 2',
          notes: null,
          collector_id: 'collector-2',
          active: true,
          created_at: '2026-10-29T12:00:00.000Z',
          collector: { full_name: 'Luis Pérez' },
        },
      ].filter(
        (customer) =>
          !collectorFilter?.startsWith('eq.') ||
          customer.collector_id === collectorFilter.slice(3),
      )),
    });
  });

  await page.route('**/rest/v1/customer_financial_status?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          customer_id: 'client-1',
          max_overdue_days: 2,
          is_blacklisted: false,
          outstanding_amount: 100,
        },
        {
          customer_id: 'client-2',
          max_overdue_days: 0,
          is_blacklisted: false,
          outstanding_amount: 50,
        },
      ]),
    });
  });

  await page.route('**/rest/v1/profiles?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'collector-1', full_name: 'Ana Torres' },
        { id: 'collector-2', full_name: 'Luis Pérez' },
      ]),
    });
  });
}
