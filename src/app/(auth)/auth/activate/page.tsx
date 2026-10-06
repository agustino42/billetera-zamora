import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/session";
import { logoutAction } from "@/features/auth/actions";
import { ActivateForm } from "@/features/auth/activate-form";
import { ROLE_HOME } from "@/shared/constants/routes";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";

export const metadata: Metadata = { title: "Activar cuenta" };

export default async function ActivatePage() {
  const profile = await getProfile();

  // Sin sesión → login; acreditado → su portal
  if (!profile) redirect("/auth/login");
  if (profile.status === "active") {
    redirect(ROLE_HOME[profile.role] ?? "/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-heading text-2xl font-semibold">
          Activar cuenta
        </h1>
        <p className="text-sm text-muted-foreground">
          Hola, {profile.full_name.split(" ")[0]}. Tu cuenta está pendiente de
          acreditación en el padrón.
        </p>
      </div>

      <ActivateForm />

      <div className="relative">
        <Separator />
        <span className="absolute inset-x-0 top-1/2 mx-auto w-fit bg-card px-2 text-xs text-muted-foreground">
          o
        </span>
      </div>

      <form action={logoutAction}>
        <Button type="submit" variant="outline" className="w-full">
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
