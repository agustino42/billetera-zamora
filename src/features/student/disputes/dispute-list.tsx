import { MessageSquareWarning } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { EmptyState } from "@/shared/ui/empty-state";
import { DISPUTE_STATUS_LABEL } from "@/shared/constants/domain";
import { formatDate } from "@/shared/utils/format";

export type DisputeRow = {
  id: string;
  grade_id: string;
  reason: string;
  status: keyof typeof DISPUTE_STATUS_LABEL;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  open: "secondary",
  in_review: "default",
  resolved_upheld: "outline",
  resolved_corrected: "outline",
  rejected: "destructive",
  closed: "outline",
};

export function DisputeList({ disputes }: { disputes: DisputeRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareWarning className="size-4 text-dorado" />
          Mis disputas
        </CardTitle>
        <CardDescription>
          Si consideras que una calificación no refleja tu desempeño, puedes
          solicitar su verificación desde la tabla de notas.
        </CardDescription>
      </CardHeader>

      {disputes.length === 0 ? (
        <EmptyState
          title="Sin disputas"
          description="Aún no has solicitado la verificación de ninguna calificación."
          className="mx-6 mb-6"
        />
      ) : (
        <ul className="space-y-3 px-6 pb-6">
          {disputes.map((d) => (
            <li key={d.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Badge variant={STATUS_VARIANT[d.status] ?? "outline"}>
                  {DISPUTE_STATUS_LABEL[d.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDate(d.created_at)}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-muted-foreground">{d.reason}</p>
              {d.resolution ? (
                <p className="mt-2 rounded bg-muted p-2 text-xs">
                  <span className="font-medium">Respuesta: </span>
                  {d.resolution}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
