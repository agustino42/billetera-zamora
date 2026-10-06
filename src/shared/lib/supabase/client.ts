import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/shared/types/database";

/**
 * Cliente de Supabase para el navegador.
 * La sesión se mantiene en cookies para que el servidor la comparta
 * (patrón oficial de @supabase/ssr con App Router).
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
