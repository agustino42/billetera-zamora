"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert } from "lucide-react";
import { loginAction, type ActionState } from "@/features/auth/actions";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="group relative w-full h-11 text-base font-medium shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30"
      disabled={pending}
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          <span>Verificando credenciales...</span>
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <span>Iniciar sesión</span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      )}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <Alert variant="destructive" className="animate-in fade-in-50 duration-200">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup className="space-y-4">
        <Field>
          <FieldLabel htmlFor="email" className="text-xs font-medium">
            Correo institucional
          </FieldLabel>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="nombre.apellido@unellez.edu.ve"
              required
              className="h-10 pl-9 transition-colors focus-visible:ring-primary/30"
            />
          </div>
        </Field>

        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password" className="text-xs font-medium">
              Contraseña
            </FieldLabel>
            <Link
              href="/auth/activate"
              className="text-[11px] font-medium text-primary hover:underline"
            >
              ¿Tienes un código?
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              minLength={8}
              placeholder="••••••••"
              className="h-10 pl-9 pr-10 transition-colors focus-visible:ring-primary/30"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
              aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <SubmitButton />
      </FieldGroup>

      <div className="space-y-3 pt-2 text-center text-sm">
        <p className="text-muted-foreground">
          ¿Aún no tienes cuenta registrada?{" "}
          <Link
            href="/auth/register"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Solicita tu registro
          </Link>
        </p>

        <div className="flex items-center justify-center gap-1.5 rounded-lg border bg-muted/50 p-2.5 text-center text-[11px] text-muted-foreground">
          <ShieldAlert className="size-3.5 shrink-0 text-muted-foreground" />
          <span>Acceso restringido a miembros acreditados en el padrón UNELLEZ.</span>
        </div>
      </div>
    </form>
  );
}
