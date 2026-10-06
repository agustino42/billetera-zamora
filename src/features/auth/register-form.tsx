"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  User,
  ArrowRight,
} from "lucide-react";
import { registerAction, type ActionState } from "@/features/auth/actions";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

const initialState: ActionState = {};

const CAREER_GROUPS = [
  {
    group: "Ingenierías",
    items: [
      { id: "Ingeniería en Computación", name: "Ingeniería en Computación" },
      { id: "Ingeniería en Electrónica", name: "Ingeniería en Electrónica" },
      {
        id: "Ingeniería en Recursos Naturales No Renovables",
        name: "Ingeniería en Recursos Naturales",
      },
      { id: "Ingeniería en Agronomía", name: "Ingeniería en Agronomía" },
    ],
  },
  {
    group: "Licenciaturas y Ciencias",
    items: [
      { id: "Licenciatura en Educación", name: "Licenciatura en Educación" },
      { id: "Licenciatura en Salud", name: "Licenciatura en Salud" },
      { id: "Ciencias Sociales", name: "Ciencias Sociales" },
    ],
  },
  {
    group: "Técnicos Superiores",
    items: [
      { id: "Técnico en Electricidad", name: "Técnico en Electricidad" },
      { id: "Técnico en Electrónica", name: "Técnico en Electrónica" },
    ],
  },
];

const CAMPUSES = [
  { id: "UNELLEZ-ZAMORA", name: "Sede Zamora (San Carlos)", badge: "Principal" },
  { id: "UNELLEZ-BARQUISAYETO", name: "Extensión Barquisayeto", badge: "Núcleo" },
  { id: "UNELLEZ-TUREN", name: "Extensión Turén", badge: "Núcleo" },
];

function getPasswordStrength(password: string) {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score += 1;

  if (score <= 1) return { score: 1, label: "Débil (mín. 8 caracteres)", color: "bg-destructive text-destructive" };
  if (score === 2) return { score: 2, label: "Aceptable", color: "bg-amber-500 text-amber-600 dark:text-amber-400" };
  if (score === 3) return { score: 3, label: "Buena y segura", color: "bg-emerald-500 text-emerald-600 dark:text-emerald-400" };
  return { score: 4, label: "Muy robusta", color: "bg-emerald-600 text-emerald-700 dark:text-emerald-300" };
}

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
          <span>Generando billetera estudiantil...</span>
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <span>Crear cuenta y billetera</span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      )}
    </Button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");

  const strength = getPasswordStrength(passwordValue);

  if (state.ok) {
    return (
      <div className="space-y-6 animate-in fade-in-50 duration-300">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center space-y-4">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5">
            <CheckCircle2 className="size-8" />
          </div>

          <div className="space-y-1">
            <h3 className="font-heading text-xl font-bold text-foreground">
              ¡Solicitud enviada con éxito!
            </h3>
            <p className="text-sm text-muted-foreground">
              {state.message}
            </p>
          </div>

          <div className="rounded-xl border bg-background/90 p-4 text-left space-y-3 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Próximos pasos para activar tu billetera:
            </p>
            <ul className="space-y-2 text-xs text-foreground/80">
              <li className="flex items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">1</span>
                <span>Confirma el enlace enviado a tu correo electrónico institucional.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">2</span>
                <span>Ingresa con tu usuario para introducir el código temporal del padrón.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">3</span>
                <span>¡Listo! Tus notas y asistencias comenzarán a acumular saldos <strong className="text-verde-osc">SEM</strong> y <strong className="text-verde">ZAM</strong>.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button asChild size="lg" className="w-full">
            <Link href="/auth/login">
              Ir al inicio de sesión <ArrowRight className="size-4 ml-1" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
            <Link href="/auth/activate">¿Ya posees código de activación? Pulsa aquí</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <Alert variant="destructive" className="animate-in fade-in-50 duration-200">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup className="space-y-5">
        {/* Sección: Identidad personal */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <User className="size-3.5 text-primary" />
            <span>Datos Personales y Acceso</span>
          </div>

          <Field>
            <FieldLabel htmlFor="full_name" className="text-xs font-medium">
              Nombre completo
            </FieldLabel>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="full_name"
                name="full_name"
                required
                minLength={3}
                placeholder="Ej. Valentina Gabriela Rodríguez"
                className="h-10 pl-9 transition-colors focus-visible:ring-primary/30"
              />
            </div>
          </Field>

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
                required
                placeholder="estudiante@unellez.edu.ve"
                className="h-10 pl-9 transition-colors focus-visible:ring-primary/30"
              />
            </div>
            <FieldDescription className="text-[11px]">
              Se utilizará para verificar tu coincidencia con las actas docentes.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="password" className="text-xs font-medium">
              Contraseña
            </FieldLabel>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                placeholder="Mínimo 8 caracteres"
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

            {/* Medidor de robustez de contraseña */}
            {passwordValue.length > 0 && (
              <div className="mt-2 space-y-1.5 animate-in fade-in-50 duration-200">
                <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      strength.score >= 1 ? strength.color.split(" ")[0] : "bg-transparent"
                    }`}
                  />
                  <div
                    className={`h-full transition-all duration-300 ${
                      strength.score >= 2 ? strength.color.split(" ")[0] : "bg-transparent"
                    }`}
                  />
                  <div
                    className={`h-full transition-all duration-300 ${
                      strength.score >= 3 ? strength.color.split(" ")[0] : "bg-transparent"
                    }`}
                  />
                  <div
                    className={`h-full transition-all duration-300 ${
                      strength.score >= 4 ? strength.color.split(" ")[0] : "bg-transparent"
                    }`}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-muted-foreground">Seguridad:</span>
                  <span className={`font-medium ${strength.color.split(" ")[1] ?? ""}`}>
                    {strength.label}
                  </span>
                </div>
              </div>
            )}
          </Field>
        </div>

        {/* Sección: Acreditación académica */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 border-b pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <GraduationCap className="size-3.5 text-primary" />
            <span>Acreditación Académica</span>
          </div>

          <Field>
            <FieldLabel htmlFor="career" className="text-xs font-medium">
              Carrera o Programa de Formación
            </FieldLabel>
            <Select name="career" defaultValue={CAREER_GROUPS[0].items[0].id}>
              <SelectTrigger id="career" className="h-10 w-full justify-between">
                <SelectValue placeholder="Selecciona tu carrera" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {CAREER_GROUPS.map((group) => (
                  <SelectGroup key={group.group}>
                    <SelectLabel className="font-semibold text-xs text-primary">
                      {group.group}
                    </SelectLabel>
                    {group.items.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription className="text-[11px]">
              Se asociará al plan de estudios para la equivalencia de notas y créditos SEM.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="campus" className="text-xs font-medium">
              Sede Universitaria
            </FieldLabel>
            <Select name="campus" defaultValue={CAMPUSES[0].id}>
              <SelectTrigger id="campus" className="h-10 w-full justify-between">
                <SelectValue placeholder="Selecciona tu sede" />
              </SelectTrigger>
              <SelectContent>
                {CAMPUSES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center justify-between w-full gap-3">
                      <span>{c.name}</span>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground rounded bg-muted px-1.5 py-0.5">
                        {c.badge}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Garantía de confianza criptográfica */}
        <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-primary mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-foreground">Padrón de confianza:</strong> Tu registro se
            vinculará de manera inmutable al libro contable de ZAMORA para garantizar la validez
            de tus saldos académicos.
          </p>
        </div>

        <SubmitButton />
      </FieldGroup>

      <div className="space-y-3 pt-2 text-center text-sm">
        <p className="text-muted-foreground">
          ¿Ya tienes cuenta activa?{" "}
          <Link
            href="/auth/login"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Inicia sesión aquí
          </Link>
        </p>

        <p className="text-[11px] text-muted-foreground/80">
          ¿Tienes código de verificación docente o de administración?{" "}
          <Link href="/auth/activate" className="text-primary hover:underline">
            Activar credencial
          </Link>
        </p>
      </div>
    </form>
  );
}
