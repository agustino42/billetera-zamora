import { createClient } from "@/shared/lib/supabase/server";
import { IssueCodeButton } from "@/features/admin/issue-code-button";
import { BalanceAdjustment } from "@/features/admin/balance-adjustment";
import { RoleBadge } from "@/features/admin/role-badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { formatDate } from "@/shared/utils/format";

export const metadata = { title: "Padrón" };

export default async function RostersPage() {
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, status, career, campus, created_at")
    .order("role", { ascending: true })
    .order("full_name", { ascending: true });

  const ids = (profiles ?? []).map((p) => p.id);
  const { data: rosters } = ids.length
    ? await supabase
        .from("rosters")
        .select("profile_id, career, active, activated_at")
        .in("profile_id", ids)
    : { data: [] };

  const rosterByProfile = new Map(
    (rosters ?? []).map((r) => [r.profile_id, r]),
  );

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Padrón</h1>
        <p className="text-sm text-muted-foreground">
          Usuarios acreditados. Solo el padrón activo puede operar la billetera.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios registrados</CardTitle>
          <CardDescription>
            Emite un código temporal para que el usuario active su cuenta. El
            código se muestra una sola vez y expira en 24 horas.
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol y estado</TableHead>
              <TableHead>Padrón</TableHead>
              <TableHead>Activada</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(profiles ?? []).map((p) => {
              const roster = rosterByProfile.get(p.id);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.full_name}</div>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                  </TableCell>
                  <TableCell>
                    <RoleBadge
                      profileId={p.id}
                      role={p.role}
                      status={p.status}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {roster?.career ?? p.career ?? "—"}
                    {roster && !roster.active ? " (inactivo)" : ""}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(roster?.activated_at ?? null)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {p.role === "student" ? (
                        <BalanceAdjustment studentId={p.id} />
                      ) : null}
                      <IssueCodeButton email={p.email} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
