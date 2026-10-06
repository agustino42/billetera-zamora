import { createClient } from "@/shared/lib/supabase/server";
import { cache } from "react";
import type { Profile } from "@/shared/types/domain";

/**
 * Sesión actual verificada contra Supabase (nunca getSession()).
 * `cache` deduplica la consulta entre layouts y páginas del mismo render.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) return null;
  return user;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, status, career, campus, phone, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  return data;
});

/** Perfil acreditado o redirect. Para layouts protegidos. */
export async function requireActiveProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) throw new Error("unauthenticated");
  if (profile.status !== "active") throw new Error("not_activated");
  return profile;
}
