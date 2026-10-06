import { createClient } from "@/shared/lib/supabase/server";
import { RedemptionActions } from "@/features/admin/redemption-actions";
import { Badge } from "@/shared/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { formatAmount, formatDateTime } from "@/shared/utils/format";

export const metadata = { title: "Canjes" };

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  fulfilled: "Entregado",
  cancelled: "Cancelado",
};

export default async function CanjesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("redemptions")
    .select(
      "id, student_id, reward_id, cost_zam, status, rejected_reason, created_at, fulfilled_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = data ?? [];

  const [{ data: people }, { data: rewards }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .in(
        "id",
        rows.length
          ? [...new Set(rows.map((r) => r.student_id))]
          : ["00000000-0000-0000-0000-000000000000"],
      ),
    supabase
      .from("reward_catalog")
      .select("id, name")
      .in(
        "id",
        rows.length
          ? [...new Set(rows.map((r) => r.reward_id))]
          : ["00000000-0000-0000-0000-000000000000"],
      ),
  ]);

  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const rewardById = new Map((rewards ?? []).map((r) => [r.id, r.name]));

  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Canjes</h1>
        <p className="text-sm text-muted-foreground">
          El ZAM se descuenta al canjear y se devuelve íntegro si se rechaza.
          Rechazar genera un movimiento compensatorio, no una edición de saldo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Solicitudes {pending > 0 ? `(${pending} pendientes)` : ""}
          </CardTitle>
          <CardDescription>Últimos 100 canjes registrados.</CardDescription>
        </CardHeader>

        {rows.length === 0 ? (
          <EmptyState
            title="Sin canjes"
            description="Cuando un estudiante canjee una recompensa aparecerá aquí."
            className="mx-6 mb-6"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estudiante</TableHead>
                <TableHead>Recompensa</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Solicitado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell>{nameById.get(r.student_id) ?? "—"}</TableCell>
                  <TableCell>{rewardById.get(r.reward_id) ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(r.cost_zam)} ZAM
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.status === "fulfilled"
                          ? "default"
                          : r.status === "rejected"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    {r.rejected_reason ? (
                      <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                        {r.rejected_reason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(r.created_at)}
                    {r.fulfilled_at
                      ? ` · entregado ${formatDateTime(r.fulfilled_at)}`
                      : ""}
                  </TableCell>
                  <TableCell>
                    <RedemptionActions
                      redemptionId={r.id}
                      studentName={nameById.get(r.student_id) ?? "El estudiante"}
                      rewardName={rewardById.get(r.reward_id) ?? "la recompensa"}
                      status={r.status}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}