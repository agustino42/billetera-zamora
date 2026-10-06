import { Badge } from "@/shared/ui/badge";
import { EmptyState } from "@/shared/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { formatDateTime, shortHash } from "@/shared/utils/format";
import type { AuditEntry } from "@/shared/types/domain";

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Sin eventos registrados"
        description="El registro de auditoría se alimenta de cada calificación, asistencia, ajuste y disputa."
        className="mx-6 mb-6"
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Seq</TableHead>
          <TableHead>Acción</TableHead>
          <TableHead>Entidad</TableHead>
          <TableHead>Hash</TableHead>
          <TableHead>Anterior</TableHead>
          <TableHead className="text-right">Fecha</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="font-mono text-xs tabular-nums">
              {e.seq}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{e.action}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {e.entity}
            </TableCell>
            <TableCell
              className="font-mono text-xs"
              title={`hash: ${e.hash}\nfirma: ${e.signature}\nalg: ${e.alg}`}
            >
              {shortHash(e.hash)}
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {shortHash(e.prev_hash, 6)}
            </TableCell>
            <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
              {formatDateTime(e.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
