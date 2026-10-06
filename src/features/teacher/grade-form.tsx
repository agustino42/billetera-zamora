"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CloudOff, Loader2, Save } from "lucide-react";
import { createClient } from "@/shared/lib/supabase/client";
import { gradeFormSchema } from "@/shared/schemas";
import { GRADE_TYPES, GRADE_TYPE_LABEL } from "@/shared/constants/domain";
import { useOfflineQueue } from "@/stores/offline-queue";
import { Alert, AlertDescription } from "@/shared/ui/alert";
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
import { Textarea } from "@/shared/ui/textarea";

export type SubjectOption = { id: string; code: string; name: string; period: string };
export type StudentOption = { id: string; full_name: string };

export function GradeForm({
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
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState<string>("exam");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const students = studentsBySubject[subjectId] ?? [];
  const selected = students.find((s) => s.id === studentId);

  useEffect(() => {
    setStudentId(students[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = gradeFormSchema.safeParse({
      subject_id: subjectId,
      student_id: studentId,
      type,
      value,
      max_value: 10,
      note,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revisa los datos");
      return;
    }

    const payload = {
      subject_id: parsed.data.subject_id,
      student_id: parsed.data.student_id,
      type: parsed.data.type,
      value: parsed.data.value,
      max_value: parsed.data.max_value,
      note: parsed.data.note || undefined,
    };

    setSaving(true);

    // Sin conexión: a la cola local con su client_event_id
    if (!online) {
      const item = await addToQueue("grade", payload);
      setSaving(false);
      setValue("");
      setNote("");
      setLastResult(
        `Guardado sin conexión. Se sincronizará automáticamente (evento ${item.client_event_id.slice(0, 8)}).`,
      );
      toast("Registro en cola offline", {
        description: "Se enviará al recuperar la conexión.",
      });
      return;
    }

    const { data, error } = await supabase.rpc("apply_grade_event", {
      p_client_event_id: crypto.randomUUID(),
      p_subject_id: payload.subject_id,
      p_student_id: payload.student_id,
      p_grade_type: payload.type as never,
      p_value: payload.value,
      p_max_value: payload.max_value,
      p_note: payload.note ?? null,
    });

    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const result = data as { sem: number; zam: number; deduped: boolean };
    setLastResult(
      `Registrado: ${selected?.full_name ?? "estudiante"} → ${result.zam} ZAM · ${result.sem} SEM`,
    );
    setValue("");
    setNote("");
    toast.success(result.deduped ? "Ya estaba registrado" : "Calificación registrada");
    router.refresh();
  }

  if (subjects.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No tienes materias asignadas. Solicita a la administración que te
          asigne una materia para poder registrar calificaciones.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Registrar calificación
          {online ? (
            <Badge variant="outline">En línea</Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <CloudOff className="size-3" /> Sin conexión
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          El valor se normaliza y se convierte en saldo con la tabla de tasas
          vigente. El evento queda firmado en el registro de auditoría.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          <FieldGroup className="sm:grid-cols-2 sm:gap-4">
            <Field>
              <FieldLabel htmlFor="subject">Materia</FieldLabel>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger id="subject">
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
              <FieldLabel htmlFor="student">Estudiante</FieldLabel>
              <Select
                value={studentId}
                onValueChange={setStudentId}
                disabled={students.length === 0}
              >
                <SelectTrigger id="student">
                  <SelectValue placeholder="Sin inscritos" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="type">Tipo de evaluación</FieldLabel>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {GRADE_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="value">Nota (sobre 10)</FieldLabel>
              <Input
                id="value"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="10"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
              <FieldDescription>
                Valor entre 0 y 10. Ejemplo: 8.5
              </FieldDescription>
            </Field>
          </FieldGroup>

          <Field>
            <FieldLabel htmlFor="note">Observación (opcional)</FieldLabel>
            <Textarea
              id="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ejercicios, rúbrica, criterios de corrección…"
              maxLength={500}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving || !hydrated}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {online ? "Registrar nota" : "Guardar en cola"}
            </Button>

            {!online ? (
              <span className="text-sm text-muted-foreground">
                Sin conexión: el registro se guardará en este dispositivo y se
                enviará solo cuando vuelva la red.
              </span>
            ) : null}
          </div>

          {lastResult ? (
            <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verde" />
              {lastResult}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
