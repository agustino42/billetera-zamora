import Link from "next/link";
import { BookOpen, ClipboardList } from "lucide-react";
import { getProfile } from "@/features/auth/session";
import { createClient } from "@/shared/lib/supabase/server";
import { loadTeachingContext } from "@/services/teacher/load";
import { GradeForm } from "@/features/teacher/grade-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { formatDate, formatGrade } from "@/shared/utils/format";

export const metadata = { title: "Portal docente" };

export default async function ProfesorPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { subjects, studentsBySubject } = await loadTeachingContext(
    supabase,
    profile!.id,
  );

  const { data: recentGrades } = await supabase
    .from("grades")
    .select("id, subject_id, student_id, type, value, max_value, registered_at")
    .eq("teacher_id", profile!.id)
    .order("registered_at", { ascending: false })
    .limit(10);

  const studentNames = new Map<string, string>();
  for (const list of Object.values(studentsBySubject)) {
    for (const s of list) studentNames.set(s.id, s.full_name);
  }

  const subjectLabels = new Map(
    subjects.map((s) => [s.id, `${s.code} · ${s.name}`]),
  );

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          Registro de desempeño
        </h1>
        <p className="text-sm text-muted-foreground">
          {profile!.full_name} · docente acreditado
        </p>
      </div>

      <GradeForm subjects={subjects} studentsBySubject={studentsBySubject} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-verde" />
              Últimos registros
            </CardTitle>
            <CardDescription>
              Registros procesados por ti, en línea o sincronizados después.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {(recentGrades ?? []).length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Todavía no has registrado calificaciones.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Materia</TableHead>
                    <TableHead>Estudiante</TableHead>
                    <TableHead className="text-right">Nota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentGrades ?? []).map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(g.registered_at)}
                      </TableCell>
                      <TableCell>
                        {subjectLabels.get(g.subject_id) ?? "—"}
                      </TableCell>
                      <TableCell>
                        {studentNames.get(g.student_id) ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatGrade(g.value, g.max_value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-dorado" />
              Mis materias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin materias asignadas.
              </p>
            ) : (
              subjects.map((s) => (
                <div key={s.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{s.code}</span>
                    <Badge variant="outline">{s.period}</Badge>
                  </div>
                  <p className="text-muted-foreground">{s.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.uc} UC · {studentsBySubject[s.id]?.length ?? 0} inscritos
                  </p>
                </div>
              ))
            )}

            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/profesor/asistencia">
                Registrar asistencia
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}