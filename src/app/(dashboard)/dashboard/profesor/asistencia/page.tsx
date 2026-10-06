import Link from "next/link";
import { ArrowLeft, CalendarCheck } from "lucide-react";
import { getProfile } from "@/features/auth/session";
import { createClient } from "@/shared/lib/supabase/server";
import { loadTeachingContext } from "@/services/teacher/load";
import { AttendanceSheet } from "@/features/teacher/attendance-sheet";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";

export const metadata = { title: "Asistencia" };

export default async function AsistenciaPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { subjects, studentsBySubject } = await loadTeachingContext(
    supabase,
    profile!.id,
  );

  const { data: sessions } = await supabase
    .from("attendance")
    .select("session_date")
    .eq("teacher_id", profile!.id)
    .order("session_date", { ascending: false })
    .limit(10);

  const dates = [...new Set((sessions ?? []).map((s) => s.session_date))];

  return (
    <>
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/dashboard/profesor">
            <ArrowLeft className="size-4" />
            Volver al registro
          </Link>
        </Button>
        <h1 className="font-heading text-2xl font-semibold">Asistencia</h1>
        <p className="text-sm text-muted-foreground">
          Funciona igual con y sin conexión.
        </p>
      </div>

      <AttendanceSheet
        subjects={subjects}
        studentsBySubject={studentsBySubject}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-dorado" />
            Sesiones registradas
          </CardTitle>
          <CardDescription>
            Fechas más recientes con al menos un registro.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {dates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no registras asistencia.
            </p>
          ) : (
            dates.map((d) => (
              <Badge key={d} variant="outline">
                {d}
              </Badge>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}