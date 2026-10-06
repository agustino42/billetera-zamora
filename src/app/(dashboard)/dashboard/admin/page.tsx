import Link from "next/link";
import { getProfile } from "@/features/auth/session";
import { createClient } from "@/shared/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { formatAmount } from "@/shared/utils/format";

export const metadata = { title: "Administración" };

export default async function AdminPage() {
  const profile = await getProfile();
  const supabase = await createClient();

  const [students, teachers, subjects, disputes, ledger, rateTable, pending] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
      supabase.from("subjects").select("id", { count: "exact", head: true }),
      supabase.from("grade_disputes").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]),
      supabase.from("audit_ledger").select("seq", { count: "exact", head: true }),
      supabase
        .from("rate_tables")
        .select("version, effective_from, rules")
        .eq("active", true)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("pending_sync").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);

  const rules = rateTable.data?.rules;

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Panel de administración</h1>
        <p className="text-sm text-muted-foreground">
          Sesión de {profile!.full_name} · todas las operaciones quedan
          registradas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Estudiantes" value={students.count ?? 0} href="/dashboard/admin/rosters" />
        <Metric label="Docentes" value={teachers.count ?? 0} />
        <Metric label="Materias" value={subjects.count ?? 0} />
        <Metric
          label="Disputas abiertas"
          value={disputes.count ?? 0}
          href="/dashboard/admin/disputas"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Regla de conversión vigente</CardTitle>
            <CardDescription>
              Tabla de tasas activa. Es pública y auditable por cualquier
              usuario acreditado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">
                {rateTable.data?.version ?? "—"}
              </Badge>
              <Badge variant="outline">
                desde {rateTable.data?.effective_from ?? "—"}
              </Badge>
            </div>
            <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs">
{`SEM = floor(UC × ${rules?.sem_per_uc ?? 1} × factor × normalized)
ZAM = floor(SEM × ${rules?.zam_ratio_over_sem ?? 0.1})
topes: ${rules?.caps?.sem_per_period ?? 400} SEM · ${rules?.caps?.zam_per_period ?? 300} ZAM`}
            </pre>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/admin/tasas">Ver detalle completo</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado del sistema</CardTitle>
            <CardDescription>
              Salud de la cadena y de la cola de sincronización.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Eventos en el ledger" value={String(ledger.count ?? 0)} />
            <Row
              label="Eventos offline con error"
              value={String(pending.count ?? 0)}
              tone={(pending.count ?? 0) > 0 ? "destructive" : undefined}
            />
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/admin/auditoria">Verificar cadena</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {formatAmount(value)}
        </CardTitle>
      </CardHeader>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "destructive";
}) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={tone === "destructive" ? "font-medium text-destructive" : "font-medium tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
