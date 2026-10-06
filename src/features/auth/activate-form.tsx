"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, ArrowRight, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { activateAction, type ActionState } from "@/features/auth/actions";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/ui/field";
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
          <span>Validando credencial en padrón...</span>
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <span>Activar credencial</span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      )}
    </Button>
  );
}

export function ActivateForm() {
  const [state, formAction] = useActionState(activateAction, initialState);

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
          <FieldLabel htmlFor="code" className="text-xs font-medium">
            Código temporal de activación
          </FieldLabel>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="code"
              name="code"
              placeholder="ZAMORA-XXXXXXXX"
              required
              minLength={6}
              className="h-10 pl-9 font-mono uppercase tracking-widest text-base transition-colors focus-visible:ring-primary/30"
            />
          </div>
          <FieldDescription className="text-[11px] leading-relaxed">
            Emitido por la administración de la UNELLEZ al incorporarte en el padrón. Tiene vigencia
            de 24 horas y valida tu identidad ante el registro criptográfico.
          </FieldDescription>
        </Field>

        <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-primary mt-0.5" />
          <span>
            La activación vincula tu clave pública y asigna automáticamente tu rol en la plataforma.
          </span>
        </div>

        <SubmitButton />
      </FieldGroup>

      <div className="space-y-2 text-center text-xs text-muted-foreground">
        <p>
          ¿No tienes un código de activación?{" "}
          <Link href="/auth/register" className="font-semibold text-primary hover:underline">
            Solicita tu registro
          </Link>
        </p>
        <p>
          ¿Ya posees una cuenta activada?{" "}
          <Link href="/auth/login" className="font-semibold text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </form>
  );
}
