import { createClient } from "@/shared/lib/supabase/server";
import { ChainVerifier } from "@/features/ledger/chain-verifier";
import { AuditTable } from "@/features/ledger/audit-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import type { AuditEntry } from "@/shared/types/domain";

export const metadata = { title: "Auditoría" };

export default async function AuditoriaPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("audit_ledger")
    .select(
      "id, seq, actor_id, action, entity, entity_id, payload, payload_hash, prev_hash, hash, signature, alg, signed_at, created_at",
    )
    .order("seq", { ascending: false })
    .limit(100);

  const entries = (data ?? []) as AuditEntry[];

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          Registro de auditoría
        </h1>
        <p className="text-sm text-muted-foreground">
          Libro append-only: no admite modificaciones ni eliminaciones, ni
          siquiera desde la base de datos.
        </p>
      </div>

      <ChainVerifier />

      <Card>
        <CardHeader>
          <CardTitle>Últimos eventos</CardTitle>
          <CardDescription>
            100 registros más recientes, del más nuevo al más antiguo.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <AuditTable entries={entries} />
        </CardContent>
      </Card>
    </>
  );
}
