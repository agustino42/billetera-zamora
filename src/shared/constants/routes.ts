import type { Role } from "@/shared/types/domain";

/** Rutas públicas: accesibles sin sesión. */
export const PUBLIC_ROUTES = ["/", "/auth/login", "/auth/register"] as const;

/** Rutas que exigen perfil acreditado (status = 'active'). */
export const ACTIVE_ROUTES = [
  "/dashboard",
  "/comunidad",
  "/offline",
] as const;

/** Inicio de cada rol. */
export const ROLE_HOME: Record<Role, string> = {
  student: "/dashboard/estudiante",
  teacher: "/dashboard/profesor",
  admin: "/dashboard/admin",
};

/** Prefijo de rutas por rol, para los guards del middleware. */
export const ROLE_PREFIX: Record<Role, string> = {
  student: "/dashboard/estudiante",
  teacher: "/dashboard/profesor",
  admin: "/dashboard/admin",
};

export const DEFAULT_GRADE_MAX = 10;

/**
 * Backoff exponencial para reintentos de la cola offline.
 * 1s, 2s, 4s, 8s, 16s y luego 30s (tope).
 */
export function retryDelayMs(retries: number): number {
  const base = 1000 * 2 ** Math.max(retries - 1, 0);
  return Math.min(base, 30_000);
}

export const MAX_RETRIES = 10;

/**
 * Descartar eventos de la cola local es una acción destructiva: en la
 * demostración se permite, pero en producción debe quedar detrás de una
 * confirmación explícita para no perder calificaciones capturadas sin red.
 */
export const ALLOW_DELETE = true;
