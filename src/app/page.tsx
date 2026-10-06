import Link from "next/link";
import {
  ArrowRight,
  Award,
  GraduationCap,
  ShieldCheck,
  Wallet,
  WifiOff,
} from "lucide-react";
import { getProfile } from "@/features/auth/session";
import { ROLE_HOME } from "@/shared/constants/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";

export default async function LandingPage() {
  const profile = await getProfile();
  const destination = profile?.status === "active" ? ROLE_HOME[profile.role] : "/auth/login";

  return (
    <main className="flex-1">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <GraduationCap className="size-4" />
            </span>
            <span className="font-heading text-lg font-semibold">ZAMORA</span>
          </div>
          <Button asChild size="sm">
            <Link href={destination}>
              {profile ? "Ir a mi billetera" : "Iniciar sesión"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-10 px-4 py-16">
        <div className="max-w-2xl space-y-4">
          <Badge variant="outline" className="border-dorado text-dorado">
            Comunidad cerrada y verificada
          </Badge>
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance">
            El desempeño verificado se convierte en saldo
          </h1>
          <p className="text-lg text-muted-foreground text-pretty">
            ZAMORA registra lo que realmente haces en la universidad y lo traduce
            en dos saldos:{" "}
            <span className="font-medium text-verde-osc">SEM</span>, que acumula tu
            desempeño, y{" "}
            <span className="font-medium text-verde">ZAM</span>, que puedes canjear.
            Una regla pública, sin discrecionalidad y con trazabilidad criptográfica.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild>
              <Link href="/auth/register">
                Solicitar registro <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/auth/login">Ya tengo cuenta</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="zamora-card-borde">
            <CardHeader>
              <Wallet className="size-5 text-verde" />
              <CardTitle>Billetera</CardTitle>
              <CardDescription>
                Saldo ZAM y SEM siempre visible, sin intermediarios ni comisiones.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Award className="size-5 text-dorado" />
              <CardTitle>Regla explícita</CardTitle>
              <CardDescription>
                La tabla de tasas es pública y auditable: cualquiera puede
                reproducir el cálculo de su saldo.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <ShieldCheck className="size-5 text-verde" />
              <CardTitle>Trazabilidad</CardTitle>
              <CardDescription>
                Cada operación queda en un registro de auditoría encadenado y
                firmado que no puede alterarse.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <WifiOff className="size-5 text-verde" />
              <CardTitle>Funciona sin señal</CardTitle>
              <CardDescription>
                Los docentes registran en el salón sin conexión; todo se
                sincroniza al volver a la red.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <section className="rounded-xl border bg-muted/40 p-6">
          <h2 className="font-heading text-lg font-semibold">
            Cómo se convierte una calificación
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Tabla de tasas vigente <span className="font-mono">mvp-1</span>
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border bg-card p-4 font-mono text-xs leading-relaxed">
{`SEM = floor( UC × 1 × factor_tipo × (valor ÷ máxima) )
ZAM = floor( SEM × 0.10 )

factor_tipo:  examen 1.0 · cuestionario 0.6 · trabajo 0.4 · práctica 0.2 · otro 0.5
topos por período:  400 SEM · 300 ZAM
canje:  solo ZAM`}
          </pre>
        </section>
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-muted-foreground">
          Universidad Nacional Experimental de los Llanos Occidentales
          &ldquo;Ezequiel Zamora&rdquo; · Billera Estudiantil de Rendimiento Académico
        </div>
      </footer>
    </main>
  );
}
