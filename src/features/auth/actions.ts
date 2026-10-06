"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/lib/supabase/server";
import { loginSchema, registerSchema, activateSchema } from "@/shared/schemas";
import { ROLE_HOME } from "@/shared/constants/routes";

export type ActionState = { error?: string; ok?: boolean; message?: string };

/** Inicio de sesión. Revalida credenciales y redirige según rol. */
export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Correo o contraseña incorrectos" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) return { error: "Tu perfil aún no está disponible" };

  revalidatePath("/", "layout");

  if (profile.status !== "active") {
    redirect("/auth/activate");
  }

  redirect(ROLE_HOME[profile.role as keyof typeof ROLE_HOME] ?? "/dashboard");
}

/** Registro. El trigger de la BD crea el perfil como student/pending. */
export async function registerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    career: formData.get("career"),
    campus: formData.get("campus") ?? "UNELLEZ-ZAMORA",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { full_name: fullName, career, campus, email, password } = parsed.data;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, career, campus },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/activate`,
    },
  });

  if (error) {
    return { error: "No se pudo crear la cuenta: " + error.message };
  }

  return {
    ok: true,
    message:
      "Cuenta creada. Revisa tu correo para confirmar la dirección y luego activa tu cuenta con el código del padrón.",
  };
}

/** Activación por padrón + código temporal. */
export async function activateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = activateSchema.safeParse({ code: formData.get("code") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Código inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_account", {
    p_code: parsed.data.code,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Cierre de sesión. */
export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/auth/login");
}
