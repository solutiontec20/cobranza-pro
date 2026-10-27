import { expect, test } from '@playwright/test';

test.describe('login', () => {
  test('muestra los controles de acceso y mantiene el envío deshabilitado', async ({ page }) => {
    const response = await page.goto('/login');

    expect(response).not.toBeNull();
    expect(response?.ok()).toBe(true);

    await expect(page).toHaveURL(/\/login\/?$/);
    await expect(page.getByLabel('DNI')).toBeVisible();
    await expect(page.getByLabel('PIN', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeDisabled();
  });

  test('impide escribir caracteres no numéricos en DNI y PIN', async ({ page }) => {
    await page.goto('/login');

    const dni = page.getByLabel('DNI');
    const pin = page.getByLabel('PIN', { exact: true });

    await dni.pressSequentially('12ab34-5678');
    await pin.pressSequentially('1x2!3456');

    await expect(dni).toHaveValue('12345678');
    await expect(pin).toHaveValue('123456');
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
  });

  test('muestra los errores de formato antes de enviar credenciales', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('DNI').fill('1234');
    await page.getByLabel('PIN', { exact: true }).fill('12');
    await page.getByLabel('DNI').blur();
    await page.getByLabel('PIN', { exact: true }).blur();

    await expect(page.getByText('El DNI debe contener 8 dígitos.')).toBeVisible();
    await expect(page.getByText('El PIN debe contener 6 dígitos.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeDisabled();
  });

  test('permite mostrar y ocultar el PIN', async ({ page }) => {
    await page.goto('/login');

    const pin = page.getByLabel('PIN', { exact: true });
    await expect(pin).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Mostrar PIN' }).click();
    await expect(pin).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Ocultar PIN' }).click();
    await expect(pin).toHaveAttribute('type', 'password');
  });
});

for (const protectedPath of [
  '/admin/clientes',
  '/admin/prestamos',
  '/cobrador',
  '/cambiar-pin',
]) {
  test(`redirige ${protectedPath} al login sin una sesión`, async ({ page }) => {
    await page.goto(protectedPath);

    await expect(page).toHaveURL(/\/login\/?$/);
  });
}

test('redirige una ruta desconocida al login', async ({ page }) => {
  await page.goto('/ruta-inexistente');

  await expect(page).toHaveURL(/\/login\/?$/);
});
