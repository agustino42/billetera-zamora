import { createClient } from "@/shared/lib/supabase/server";
import { Badge } from "@/shared/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { formatDate } from "@/shared/utils/format";
import { GRADE_TYPES, GRADE_TYPE_LABEL } from "@/shared/constants/domain";
import type { RateTable, RateTableRules } from "@/shared/types/domain";

export const metadata = { title: "Tasas" };

export default async function TasasPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("rate_tables")
    .select("id, name, version, effective_from, effective_to, rules, active")
    .order("effective_from", { ascending: false });

  const tables = (data ?? []) as Pick<
    RateTable,
    "id" | "name" | "version" | "effective_from" | "effective_to" | "rules" | "active"
  >[];

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          Tabla de tasas
        </h1>
        <p className="text-sm text-muted-foreground">
          La conversión nota → SEM → ZAM es pública y auditable. Cualquier
          usuario autenticado puede leerla; solo administración publica cambios.
        </p>
      </div>

      {tables.map((t) => (
        <Card key={t.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t.name}
              <Badge variant={t.active ? "default" : "outline"}>
                {t.active ? "Activa" : "Inactiva"}
              </Badge>
              <Badge variant="secondary">{t.version}</Badge>
            </CardTitle>
            <CardDescription>
              Vigente desde {formatDate(t.effective_from)}
              {t.effective_to ? ` hasta ${formatDate(t.effective_to)}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Formula rules={t.rules} />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de evaluación</TableHead>
                  <TableHead className="text-right">Factor</TableHead>
                  <TableHead className="text-right">Ejemplo: 8/10 → SEM</TableHead>
                  <TableHead className="text-right">ZAM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {GRADE_TYPES.map((g) => {
                  const factor = t.rules.factor_by_grade_type[g];
                  const sem = Math.floor(
                    3 * t.rules.sem_per_uc * factor * 0.8,
                  );
                  return (
                    <TableRow key={g}>
                      <TableCell>{GRADE_TYPE_LABEL[g]}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {factor.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {sem} SEM
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-dorado">
                        {Math.floor(sem * t.rules.zam_ratio_over_sem)} ZAM
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell>Asistencia</TableCell>
                  <TableCell className="text-right tabular-nums">0.0</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {t.rules.attendance_points.present} SEM
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    sin bonificación
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <p className="text-xs text-muted-foreground">
              Ejemplo calculado con 3 UC y nota 8/10 (normalizado 0,80). El
              redondeo es siempre hacia abajo (floor) y el tope por período es de{" "}
              {t.rules.caps.sem_per_period} SEM y {t.rules.caps.zam_per_period}{" "}
              ZAM. El canje de recompensas usa {t.rules.redemption_currency.toUpperCase()}.
            </p>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function Formula({ rules }: { rules: RateTableRules }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs">
{`normalized  = value / max_value
SEM        = floor(${rules.sem_per_uc} × UC × factor × normalized)
ZAM        = floor(SEM × ${rules.zam_ratio_over_sem})
tope       = ${rules.caps.sem_per_period} SEM · ${rules.caps.zam_per_period} ZAM por período`}
    </pre>
  );
}