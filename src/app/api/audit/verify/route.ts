import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { verifyChain, type LedgerRow } from "@/services/domain/ledger-chain";
import type { ChainVerificationRow } from "@/shared/types/domain";

export const runtime = "nodejs";

/**
 * Verificación de la cadena de auditoría (solo administración).
 *
 * Doble comprobación, a propósito:
 *   1. RPC `verify_audit_chain` → recalcula en la base de datos, donde vive
 *      la llave HMAC (ledger_keys). Comprueba payload, enlace y firma.
 *   2. `verifyChain` → recomputa los mismos hashes en Node, de forma
 *      independiente, para no depender de la única implementación.
 *
 * La llave nunca sale del servidor: solo se devuelven resultados.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" || profile.status !== "active") {
    return NextResponse.json(
      { error: "Requiere rol de administración" },
      { status: 403 },
    );
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: dbReport, error: rpcError } = await admin.rpc(
    "verify_audit_chain",
  );

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const { data: rows, error: rowsError } = await admin
    .from("audit_ledger")
    .select(
      "seq, actor_id, action, entity, entity_id, payload, payload_hash, prev_hash, hash, signature, created_at",
    )
    .order("seq", { ascending: true });

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 500 });
  }

  // Segunda opinión: recomputación en Node (sin la firma, que es secreta).
  const nodeReport = new Map(
    verifyChain((rows ?? []) as LedgerRow[]).map((r) => [r.seq, r]),
  );

  const detail: ChainVerificationRow[] = (
    (dbReport ?? []) as ChainVerificationRow[]
  ).map((row) => {
    const seq = Number(row.seq);
    const node = nodeReport.get(seq);
    return {
      seq,
      payload_ok: row.payload_ok,
      chain_ok: row.chain_ok,
      signature_ok: row.signature_ok,
      prev_ok: row.prev_ok,
      ok: row.ok && (node?.ok ?? true),
      detail: node && !node.ok ? `node: ${node.detail}` : row.detail,
    };
  });

  const broken = detail.filter((r) => !r.ok);

  return NextResponse.json({
    total: detail.length,
    ok: broken.length === 0,
    broken: broken.length,
    signature_verified_in: "database",
    cross_checked_in: "node",
    detail: detail.slice(-50).reverse(),
  });
}