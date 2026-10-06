"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/shared/lib/supabase/client";
import { disputeSchema } from "@/shared/schemas";
import { GRADE_TYPE_LABEL } from "@/shared/constants/domain";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Field, FieldLabel } from "@/shared/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Textarea } from "@/shared/ui/textarea";
import { EmptyState } from "@/shared/ui/empty-state";
import { formatDate, formatGrade, formatNormalized } from "@/shared/utils/format";
import type { GradeType } from "@/shared/types/domain";

export type GradeRow = {
  id: string;
  subject_label: string;
  type: GradeType;
  value: number;
  max_value: number;
  normalized: number;
  period: string;
  status: "active" | "voided";
  registered_at: string;
  note: string | null;
};

export function GradesPanel({ grades }: { grades: GradeRow[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<GradeRow | null>(null);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [pending, startTransition] = useTransition();

  async function openDispute() {
    if (!target) return;

    const parsed = disputeSchema.safeParse({
      grade_id: target.id,
      reason,
      evidence,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revisa el motivo");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.rpc("open_grade_dispute", {
      p_grade_id: parsed.data.grade_id,
      p_reason: parsed.data.reason,
      p_evidence: parsed.data.evidence || null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Disputa registrada. La administración la revisará.");
    setTarget(null);
    setReason("");
    setEvidence("");
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mis calificaciones</CardTitle>
        <CardDescription>
          Cada nota registrada por tu docente, con el valor normalizado que
          determina tu saldo.
        </CardDescription>
      </CardHeader>

      {grades.length === 0 ? (
        <EmptyState
          title="Sin calificaciones aún"
          description="Cuando tus docentes registren notas, aparecerán aquí."
          className="mx-6 mb-6"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Materia</TableHead>
              <TableHead>Evaluación</TableHead>
              <TableHead className="text-right">Nota</TableHead>
              <TableHead className="text-right">Normalizado</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grades.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(g.registered_at)}
                </TableCell>
                <TableCell>{g.subject_label}</TableCell>
                <TableCell>
                  <Badge variant="outline">{GRADE_TYPE_LABEL[g.type]}</Badge>
                  {g.status === "voided" ? (
                    <Badge variant="destructive" className="ml-2">
                      Anulada
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatGrade(g.value, g.max_value)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatNormalized(Number(g.normalized))}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTarget(g)}
                    disabled={g.status !== "active"}
                  >
                    <MessageSquareWarning className="size-4" />
                    Disputar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar verificación</DialogTitle>
            <DialogDescription>
              {target
                ? `${target.subject_label} · ${GRADE_TYPE_LABEL[target.type]} · ${formatGrade(target.value, target.max_value)}`
                : null}
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="dispute-reason">Motivo</FieldLabel>
            <Textarea
              id="dispute-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe el hecho y por qué consideras que la nota no refleja tu desempeño."
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="dispute-evidence">Evidencia (opcional)</FieldLabel>
            <Textarea
              id="dispute-evidence"
              rows={3}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Fechas, enlaces a entregas, rúbrica de la actividad…"
            />
          </Field>

          <DialogFooter>
            <Button onClick={openDispute} disabled={pending}>
              Enviar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
