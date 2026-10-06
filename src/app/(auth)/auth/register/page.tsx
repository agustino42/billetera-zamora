import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/register-form";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Registro de Estudiantes · ZAMORA",
  description:
    "Crea tu billetera estudiantil con acreditación verificable en UNELLEZ.",
};

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" />
          <span>Billetera de Desempeño Curricular</span>
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Crea tu cuenta estudiantil
        </h1>
        <p className="text-sm text-muted-foreground text-pretty max-w-sm mx-auto">
          Convierte tus calificaciones y asistencias en saldo{" "}
          <span className="font-semibold text-verde-osc">SEM</span> y tokens{" "}
          <span className="font-semibold text-verde">ZAM</span> canjeables.
        </p>
      </div>

      <RegisterForm />
    </div>
  );
}
