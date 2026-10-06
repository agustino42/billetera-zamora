"use server";

import { createClient } from "@/shared/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

/**
 * Emite un código temporal de activación.
 * Requiere rol admin; la generación del código ocurre en la BD
 * (issue_activation_code) y el texto plano solo se devuelve aquí, una vez.
 */
export async function issueActivationCode(
  email: string,
): Promise<{ code?: string; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return { error: "Requiere rol de administración" };
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await admin.rpc("issue_activation_code", {
    p_email: email,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/admin/rosters");

  return { code: String(data) };
}
