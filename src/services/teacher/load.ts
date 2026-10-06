import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/types/database";
import type { StudentOption, SubjectOption } from "@/features/teacher/grade-form";

export type TeachingSubject = SubjectOption & { uc: number };

export type TeachingContext = {
  subjects: TeachingSubject[];
  studentsBySubject: Record<string, StudentOption[]>;
};

/**
 * Carga las materias del docente y su padrón de inscritos.
 * Se consulta en dos pasos (enrollments → profiles) para no depender de
 * los embeds anidados de PostgREST en los tipos generados.
 */
export async function loadTeachingContext(
  supabase: SupabaseClient<Database>,
  teacherId: string,
): Promise<TeachingContext> {
  const { data: subjectRows } = await supabase
    .from("subjects")
    .select("id, code, name, period, uc")
    .eq("teacher_id", teacherId)
    .eq("active", true)
    .order("code");

  const subjects: TeachingSubject[] = (subjectRows ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    period: s.period,
    uc: s.uc,
  }));

  const studentsBySubject: Record<string, StudentOption[]> = {};

  for (const subject of subjects) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("subject_id", subject.id)
      .eq("active", true);

    const ids = (enrollments ?? []).map((e) => e.student_id);

    if (ids.length === 0) {
      studentsBySubject[subject.id] = [];
      continue;
    }

    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);

    const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

    studentsBySubject[subject.id] = ids.map((id) => ({
      id,
      full_name: nameById.get(id) ?? "Estudiante",
    }));
  }

  return { subjects, studentsBySubject };
}