"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/shared/lib/supabase/client";
import { formatAmount } from "@/shared/utils/format";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";

export type RewardRow = {
  id: string;
  name: string;
  description: string | null;
  cost_zam: number;
  stock: number | null;
  stock_type: "unlimited" | "limited";
  requires_approval: boolean;
};

export function RewardsPanel({
  rewards,
  balanceZam,
}: {
  rewards: RewardRow[];
  balanceZam: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);

  async function redeem(reward: RewardRow) {
    setBusy(reward.id);

    // El canje no admite reintento automático: el identificador del evento
    // se genera una vez y el RPC lo deduplica si el usuario repite el clic.
    const { data, error } = await supabase.rpc("redeem_reward", {
      p_reward_id: reward.id,
      p_client_event_id: crypto.randomUUID(),
    });

    setBusy(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    const result = data as { deduped: boolean; status: string; cost_zam: number };

    if (result.deduped) {
      toast.info("Ese canje ya estaba registrado");
      return;
    }

    toast.success(
      `Canjeaste ${reward.name} por ${formatAmount(result.cost_zam)} ZAM`,
      {
        description:
          result.status === "pending"
            ? "Queda pendiente de aprobación de la administración."
            : "Disponible para retirar en la ventana de atención.",
      },
    );
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="size-4 text-dorado" />
          Recompensas
        </CardTitle>
        <CardDescription>
          El canje se paga en ZAM (tu desempeño verificado), nunca en SEM.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {rewards.length === 0 ? (
          <EmptyState
            title="Sin recompensas publicadas"
            description="La administración publicará el catálogo de canjes pronto."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rewards.map((reward) => {
              const soldOut =
                reward.stock_type === "limited" && (reward.stock ?? 0) <= 0;
              const affordable = balanceZam >= Number(reward.cost_zam);

              return (
                <li
                  key={reward.id}
                  className="flex flex-col gap-2 rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{reward.name}</p>
                      {reward.description ? (
                        <p className="text-sm text-muted-foreground">
                          {reward.description}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {formatAmount(reward.cost_zam)} ZAM
                    </Badge>
                  </div>

                  <div className="mt-auto flex items-center gap-2">
                    {reward.requires_approval ? (
                      <Badge variant="secondary">requiere aprobación</Badge>
                    ) : (
                      <Badge variant="secondary">entrega inmediata</Badge>
                    )}
                    {soldOut ? <Badge variant="destructive">agotado</Badge> : null}

                    <Button
                      size="sm"
                      className="ml-auto"
                      disabled={busy === reward.id || soldOut || !affordable}
                      onClick={() => redeem(reward)}
                      title={
                        !affordable && !soldOut
                          ? "No tienes ZAM suficientes"
                          : undefined
                      }
                    >
                      {busy === reward.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      {soldOut ? "Agotado" : "Canjear"}
                    </Button>
                  </div>

                  {!affordable && !soldOut ? (
                    <p className="text-xs text-muted-foreground">
                      Te faltan {formatAmount(Number(reward.cost_zam) - balanceZam)} ZAM.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}