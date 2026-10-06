import { NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { syncBatchSchema } from "@/shared/schemas/sync";
import type { ApplyEventResult } from "@/shared/types/domain";

export const runtime = "nodejs";

type Outcome = { ok: boolean; result?: ApplyEventResult; error?: string };

/**
 * Lote de sincronización diferida.
 *
 * Cada item se aplica con el RPC correspondiente usando la SESIÓN DEL USUARIO
 * (no la service role): el servidor vuelve a validar rol, materia, inscripción
 * y padrón. La deduplicación la garantiza `client_event_id`, de modo que
 * reintentar un lote nunca duplica una calificación.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const parsed = syncBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Lote inválido", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const results: Record<string, Outcome> = {};

  for (const item of parsed.data.items) {
    try {
      if (item.type === "grade") {
        const payload = item.payload as {
          subject_id: string;
          student_id: string;
          type: string;
          value: number;
          max_value?: number;
          note?: string;
          registered_at?: string;
        };

        const { data, error } = await supabase.rpc("apply_grade_event", {
          p_client_event_id: item.client_event_id,
          p_subject_id: payload.subject_id,
          p_student_id: payload.student_id,
          p_grade_type: payload.type as never,
          p_value: payload.value,
          p_max_value: payload.max_value ?? 10,
          p_note: payload.note ?? null,
          p_registered_at: payload.registered_at ?? null,
        });

        results[item.client_event_id] = error
          ? { ok: false, error: error.message }
          : { ok: true, result: data as ApplyEventResult };
      } else {
        const payload = item.payload as {
          subject_id: string;
          student_id: string;
          session_date: string;
          status: string;
          note?: string;
          registered_at?: string;
        };

        const { data, error } = await supabase.rpc("apply_attendance_event", {
          p_client_event_id: item.client_event_id,
          p_subject_id: payload.subject_id,
          p_student_id: payload.student_id,
          p_session_date: payload.session_date,
          p_status: payload.status as never,
          p_note: payload.note ?? null,
          p_registered_at: payload.registered_at ?? null,
        });

        results[item.client_event_id] = error
          ? { ok: false, error: error.message }
          : { ok: true, result: data as ApplyEventResult };
      }
    } catch (error) {
      results[item.client_event_id] = {
        ok: false,
        error: error instanceof Error ? error.message : "Error inesperado",
      };
    }
  }

  // Fallos observables por administración (RLS: solo el propio usuario escribe)
  const failures = parsed.data.items.filter(
    (i) => results[i.client_event_id]?.ok === false,
  );

  if (failures.length > 0) {
    await supabase.from("pending_sync").upsert(
      failures.map((i) => ({
        user_id: user.id,
        type: i.type,
        payload: i.payload as never,
        status: "failed",
        retries: 1,
        last_attempt_at: new Date().toISOString(),
        error: results[i.client_event_id].error ?? null,
        client_event_id: i.client_event_id,
      })),
      { onConflict: "client_event_id" },
    );
  }

  const applied = Object.values(results).filter((r) => r.ok).length;

  return NextResponse.json({
    results,
    summary: {
      received: parsed.data.items.length,
      applied,
      failed: parsed.data.items.length - applied,
    },
  });
}
