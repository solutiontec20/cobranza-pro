import { expect, test } from '@playwright/test';

test('la ruta /login es accesible', async ({ page }) => {
  const response = await page.goto('/login');

  expect(response).not.toBeNull();
  expect(response?.ok()).toBe(true);

  await expect(page).toHaveURL(/\/login\/?$/);
});
