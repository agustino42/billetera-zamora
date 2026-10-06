import { getProfile } from "@/features/auth/session";
import { createClient } from "@/shared/lib/supabase/server";
import { BalanceCards } from "@/features/wallet/balance-cards";
import {
  TransactionsTable,
  type TransactionRow,
} from "@/features/wallet/transactions-table";
import { GradesPanel } from "@/features/student/grades-panel";
import { DisputeList } from "@/features/student/disputes/dispute-list";
import {
  RewardsPanel,
  type RewardRow,
} from "@/features/wallet/rewards-panel";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";

export const metadata = { title: "Mi billetera" };

export default async function EstudiantePage() {
  const profile = await getProfile();
  const supabase = await createClient();

  const [balanceRes, txRes, gradesRes, disputesRes, announcementsRes, rewardsRes] =
    await Promise.all([
      supabase
        .from("balances")
        .select("profile_id, zam, sem, updated_at")
        .eq("profile_id", profile!.id)
        .maybeSingle(),
      supabase
        .from("transactions")
        .select(
          "id, profile_id, type, amount_zam, amount_sem, ref_type, ref_id, period, reason, created_by, created_at, client_event_id",
        )
        .eq("profile_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("grades")
        .select("id, subject_id, type, value, max_value, normalized, period, status, registered_at, note")
        .eq("student_id", profile!.id)
        .order("registered_at", { ascending: false })
        .limit(50),
      supabase
        .from("grade_disputes")
        .select("id, grade_id, reason, status, resolution, resolved_at, created_at")
        .eq("student_id", profile!.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("announcements")
        .select("id, title, body, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(5),
      supabase
        .from("reward_catalog")
        .select(
          "id, name, description, cost_zam, stock, stock_type, requires_approval",
        )
        .eq("active", true)
        .order("cost_zam", { ascending: true }),
    ]);

  const grades = gradesRes.data ?? [];

  // Nombre de la materia para cada calificación
  const subjectIds = [...new Set(grades.map((g) => g.subject_id))];
  const { data: subjects } = subjectIds.length
    ? await supabase.from("subjects").select("id, code, name").in("id", subjectIds)
    : { data: [] };

  const subjectName = new Map(
    (subjects ?? []).map((s) => [s.id, `${s.code} · ${s.name}`]),
  );

  // Una transacción de tipo "grade" referencia el id de la calificación,
  // no el de la materia: hay que pasar por la nota para obtener la materia.
  const subjectOfGrade = new Map(
    grades.map((g) => [g.id, subjectName.get(g.subject_id) ?? null]),
  );

  const rows: TransactionRow[] = (txRes.data ?? []).map((t) => ({
    ...(t as TransactionRow),
    subject_name:
      t.ref_type === "grade" && t.ref_id
        ? subjectOfGrade.get(t.ref_id) ?? null
        : null,
  }));

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          Hola, {profile!.full_name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Tu desempeño verificado, traducido a saldo.
        </p>
      </div>

      {(announcementsRes.data ?? []).map((a) => (
        <Alert key={a.id}>
          <AlertTitle>{a.title}</AlertTitle>
          <AlertDescription>{a.body}</AlertDescription>
        </Alert>
      ))}

      <BalanceCards balance={balanceRes.data} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Movimientos recientes</CardTitle>
            <CardDescription>
              Cada movimiento corresponde a una operación auditada en el libro
              institucional.
            </CardDescription>
          </CardHeader>
          <TransactionsTable rows={rows} />
        </Card>

        <div className="space-y-6">
          <DisputeList disputes={disputesRes.data ?? []} />
        </div>
      </div>

      <GradesPanel
        grades={grades.map((g) => ({
          ...g,
          subject_label: subjectName.get(g.subject_id) ?? "Materia",
        }))}
      />

      <RewardsPanel
        rewards={(rewardsRes.data ?? []) as RewardRow[]}
        balanceZam={Number(balanceRes.data?.zam ?? 0)}
      />
    </>
  );
}
