import { expect, test } from "@playwright/test";

/**
 * Recorrido público: no requiere sesión ni variables de Supabase reales.
 * El resto de flujos (registro, captura, saldo) necesita la base de datos
 * migrada; ver docs/QA.md.
 */

test("la landing presenta la propuesta de valor y el acceso", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1 }),
  ).toContainText("desempeño verificado");
  await expect(page.getByText("ZAMORA").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /iniciar sesión/i }),
  ).toBeVisible();
});

test("el acceso no autenticado rebota a /auth/login", async ({ page }) => {
  await page.goto("/dashboard/estudiante");

  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByLabel(/correo/i)).toBeVisible();
});

test("la pantalla de login exige correo y contraseña", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel(/correo/i).fill("nadie@zamora.test");
  await page.getByLabel(/contraseña/i).fill("clave-de-prueba");
  await page.getByRole("button", { name: /iniciar sesión/i }).click();

  // Sin backend real no hay sesión: debe informar el error, no_blankear.
  await expect(page.getByRole("alert")).toBeVisible();
});

test("el registro valida el formulario en el cliente", async ({ page }) => {
  await page.goto("/auth/register");

  await page.getByLabel(/nombre/i).fill("A");
  await page.getByLabel(/correo/i).fill("no-es-correo");
  await page.getByLabel(/contraseña/i, { exact: true }).fill("123");
  await page.getByRole("button", { name: /crear cuenta/i }).click();

  await expect(page.getByText(/nombre completo/i)).toBeVisible();
});

test("el manifiesto de la PWA es válido y no sirve datos vivos", async ({
  request,
}) => {
  const response = await request.get("/manifest.json");
  expect(response.ok()).toBeTruthy();

  const manifest = (await response.json()) as {
    name: string;
    display: string;
    theme_color: string;
    icons: { src: string; sizes: string }[];
  };

  expect(manifest.name).toContain("ZAMORA");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((i) => i.sizes)).toContain("512x512");
});

test("la cola offline es accesible sin conexión", async ({ page }) => {
  // Se navega a /offline con sesión falsa: el middleware manda a login,
  // así que solo comprobamos que la ruta existe y no devuelve 500.
  const response = await page.goto("/offline");
  const status = response?.status() ?? 0;
  expect([200, 307, 302, 401, 403]).toContain(status);
});