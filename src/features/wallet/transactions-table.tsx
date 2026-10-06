import { EmptyState } from "@/shared/ui/empty-state";
import { Badge } from "@/shared/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { formatAmount, formatDateTime } from "@/shared/utils/format";
import type { Transaction } from "@/shared/types/domain";

const TYPE_LABEL: Record<string, string> = {
  earn: "Otorgado",
  redeem: "Canje",
  adjust: "Ajuste",
};

const REF_LABEL: Record<string, string> = {
  grade: "Calificación",
  attendance: "Asistencia",
  adjustment: "Ajuste",
  redemption: "Canje",
  dispute: "Disputa",
};

export type TransactionRow = Transaction & {
  subject_name?: string | null;
};

export function TransactionsTable({ rows }: { rows: TransactionRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay movimientos"
        description="Cuando un docente registre una calificación, el saldo se moverá aquí con su detalle."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Concepto</TableHead>
          <TableHead className="text-right">SEM</TableHead>
          <TableHead className="text-right">ZAM</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDateTime(t.created_at)}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={t.type === "earn" ? "default" : t.type === "redeem" ? "secondary" : "outline"}>
                  {TYPE_LABEL[t.type] ?? t.type}
                </Badge>
                <span>
                  {t.ref_type ? (REF_LABEL[t.ref_type] ?? t.ref_type) : "Movimiento"}
                </span>
                {t.subject_name ? (
                  <span className="text-muted-foreground">· {t.subject_name}</span>
                ) : null}
              </div>
              {t.reason ? (
                <p className="mt-1 text-xs text-muted-foreground">{t.reason}</p>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {Number(t.amount_sem) !== 0 ? formatAmount(t.amount_sem) : "—"}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {Number(t.amount_zam) !== 0 ? (
                <span className={Number(t.amount_zam) < 0 ? "text-destructive" : ""}>
                  {formatAmount(t.amount_zam)}
                </span>
              ) : (
                "—"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
