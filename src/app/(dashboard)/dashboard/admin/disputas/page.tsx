import { createClient } from "@/shared/lib/supabase/server";
import { DisputeResolutionButton } from "@/features/admin/dispute-resolution-button";
import { DISPUTE_STATUS_LABEL } from "@/shared/constants/domain";
import { Badge } from "@/shared/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { EmptyState } from "@/shared/ui/empty-state";
import { formatDateTime } from "@/shared/utils/format";
import type { DisputeStatus } from "@/shared/types/domain";

export const metadata = { title: "Disputas" };

type Row = {
  id: string;
  grade_id: string;
  student_id: string;
  teacher_id: string;
  reason: string;
  evidence: string | null;
  status: DisputeStatus;
  resolution: string | null;
  created_at: string;
};

const OPEN: DisputeStatus[] = ["open", "in_review"];

export default async function DisputasPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("grade_disputes")
    .select(
      "id, grade_id, student_id, teacher_id, reason, evidence, status, resolution, created_at",
    )
    .in("status", OPEN)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as Row[];

  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  const teacherIds = [...new Set(rows.map((r) => r.teacher_id))];

  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", [...studentIds, ...teacherIds]);

  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  const { data: grades } = await supabase
    .from("grades")
    .select("id, value, max_value, subject_id, verified")
    .in("id", rows.length ? rows.map((r) => r.grade_id) : ["00000000-0000-0000-0000-000000000000"]);

  const subjectIds = [
    ...new Set((grades ?? []).map((g) => g.subject_id)),
  ];

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, code, name")
    .in("id", subjectIds.length ? subjectIds : ["00000000-0000-0000-0000-000000000000"]);

  const subjectById = new Map(
    (subjects ?? []).map((s) => [s.id, `${s.code} · ${s.name}`]),
  );
  const gradeById = new Map((grades ?? []).map((g) => [g.id, g]));

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Disputas de calificación</h1>
        <p className="text-sm text-muted-foreground">
          Cada resolución queda firmada en el registro de auditoría. Si la nota
          debe corregirse, aplica el ajuste de saldo correspondiente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Pendientes ({rows.length})
          </CardTitle>
          <CardDescription>
            El profesor marca la disputa como «en revisión»; la administración
            decide.
          </CardDescription>
        </CardHeader>

        {rows.length === 0 ? (
          <EmptyState
            title="Sin disputas pendientes"
            description="Cuando un estudiante cuestione una nota aparecerá aquí."
            className="mx-6 mb-6"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estudiante</TableHead>
                <TableHead>Materia / nota</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Docente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const grade = gradeById.get(r.grade_id);
                return (
                  <TableRow key={r.id} className="align-top">
                    <TableCell>
                      <div className="font-medium">
                        {nameById.get(r.student_id) ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(r.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {grade
                          ? (subjectById.get(grade.subject_id) ?? "—")
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {grade ? `${grade.value} / ${grade.max_value}` : "nota no encontrada"}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <p className="text-sm">{r.reason}</p>
                      {r.evidence ? (
                        <p className="mt-1 border-l-2 border-muted pl-2 text-xs text-muted-foreground">
                          {r.evidence}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {nameById.get(r.teacher_id) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.status === "open" ? "secondary" : "default"}
                      >
                        {DISPUTE_STATUS_LABEL[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DisputeResolutionButton disputeId={r.id} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}