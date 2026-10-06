import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Las pruebas E2E de este repositorio solo recorren rutas públicas, que no
// tocan la base de datos. Si el entorno no trae credenciales, se inyectan
// marcadores para que el servidor arranque y el smoke test pueda correr sin
// `.env.local`. Cualquier flujo autenticado exige un entorno real.
const env: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-role-key",
  NEXT_PUBLIC_SITE_URL: baseURL,
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // El servidor de desarrollo compila la ruta en el primer impacto: un
  // reintento evita falsos negativos por compilación en frío.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    locale: "es-VE",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        env,
      },
});