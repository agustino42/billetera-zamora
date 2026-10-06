import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/login-form";
import { LogIn } from "lucide-react";

export const metadata: Metadata = {
  title: "Iniciar sesión · ZAMORA",
  description: "Accede a tu billetera estudiantil y consulta tus saldos SEM y ZAM.",
};

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <div className="mx-auto mb-1 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LogIn className="size-5" />
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Iniciar sesión
        </h1>
        <p className="text-sm text-muted-foreground text-pretty max-w-sm mx-auto">
          Accede a tu billetera y consulta tus saldos de desempeño verificados.
        </p>
      </div>

      <LoginForm />
    </div>
  );
}
