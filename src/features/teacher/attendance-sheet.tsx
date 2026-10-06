"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, CloudOff, Loader2, Save } from "lucide-react";
import { createClient } from "@/shared/lib/supabase/client";
import { attendanceFormSchema } from "@/shared/schemas";
import {
  ATTENDANCE_LABEL,
  ATTENDANCE_STATUSES,
} from "@/shared/constants/domain";
import { useOfflineQueue } from "@/stores/offline-queue";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { AttendanceStatus } from "@/shared/types/domain";
import type { StudentOption, SubjectOption } from "@/features/teacher/grade-form";

type Draft = Record<string, AttendanceStatus>;

export function AttendanceSheet({
  subjects,
  studentsBySubject,
}: {
  subjects: SubjectOption[];
  studentsBySubject: Record<string, StudentOption[]>;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const online = useOfflineQueue((s) => s.online);
  const addToQueue = useOfflineQueue((s) => s.add);
  const hydrated = useOfflineQueue((s) => s.hydrated);

  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const students = studentsBySubject[subjectId] ?? [];

  useEffect(() => {
    setDraft({});
  }, [subjectId]);

  function cycle(studentId: string) {
    setDraft((prev) => {
      const current = prev[studentId] ?? "present";
      const next = ATTENDANCE_STATUSES[(ATTENDANCE_STATUSES.indexOf(current) + 1) % ATTENDANCE_STATUSES.length];
      return { ...prev, [studentId]: next };
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const records = students.map((s) => ({
      student_id: s.id,
      status: draft[s.id] ?? ("present" as AttendanceStatus),
    }));

    const parsed = attendanceFormSchema.safeParse({
      subject_id: subjectId,
      session_date: date,
      records,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revisa los datos");
      return;
    }

    setSaving(true);

    if (!online) {
      for (const record of parsed.data.records) {
        await addToQueue("attendance", {
          subject_id: parsed.data.subject_id,
          session_date: parsed.data.session_date,
          student_id: record.student_id,
          status: record.status,
        });
      }
      setSaving(false);
      setLastResult(
        `${parsed.data.records.length} registros guardados en la cola offline.`,
      );
      toast("Asistencia en cola", {
        description: "Se enviará al recuperar la conexión.",
      });
      return;
    }

    let applied = 0;
    const failures: string[] = [];

    for (const record of parsed.data.records) {
      const { error } = await supabase.rpc("apply_attendance_event", {
        p_client_event_id: crypto.randomUUID(),
        p_subject_id: parsed.data.subject_id,
        p_student_id: record.student_id,
        p_session_date: parsed.data.session_date,
        p_status: record.status,
      });

      if (error) failures.push(error.message);
      else applied += 1;
    }

    setSaving(false);
    setDraft({});

    setLastResult(
      failures.length === 0
        ? `${applied} asistencias registradas.`
        : `${applied} registradas, ${failures.length} con error: ${failures[0]}`,
    );

    if (failures.length === 0) {
      toast.success("Asistencia registrada");
      router.refresh();
    } else {
      toast.error("Registro parcial", { description: failures[0] });
    }
  }

  if (subjects.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            No tienes materias asignadas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-verde" />
          Registrar asistencia
          {online ? null : (
            <Badge variant="destructive" className="gap-1">
              <CloudOff className="size-3" /> Sin conexión
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Toca una fila para alternar presente → ausente → tardanza →
          justificada. Por decisión de la tabla de tasas, la asistencia no
          otorga saldo: queda registrada para la defendedora.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          <FieldGroup className="sm:grid-cols-2 sm:gap-4">
            <Field>
              <FieldLabel htmlFor="as-subject">Materia</FieldLabel>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger id="as-subject">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="as-date">Fecha de la sesión</FieldLabel>
              <Input
                id="as-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              <FieldDescription>Un evento por estudiante y fecha.</FieldDescription>
            </Field>
          </FieldGroup>

          <ul className="divide-y rounded-lg border">
            {students.map((s) => {
              const status = draft[s.id] ?? "present";
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => cycle(s.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50"
                  >
                    <span>{s.full_name}</span>
                    <Badge
                      variant={status === "present" ? "default" : "secondary"}
                    >
                      {ATTENDANCE_LABEL[status]}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving || !hydrated}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Guardar asistencia ({students.length})
            </Button>
            {lastResult ? (
              <span className="text-sm text-muted-foreground">{lastResult}</span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}