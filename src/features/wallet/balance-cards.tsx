import { Coins, Gem, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { formatAmount } from "@/shared/utils/format";
import type { Balance } from "@/shared/types/domain";

function Saldo({
  label,
  value,
  description,
  icon,
  tone,
}: {
  label: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <Card className={`zamora-card-borde ${tone}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="font-heading text-3xl font-semibold tabular-nums">
          {formatAmount(value)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

/** La billetera: ZAM canjeable + SEM acumulado. */
export function BalanceCards({
  balance,
  loading = false,
}: {
  balance?: Balance | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const zam = Number(balance?.zam ?? 0);
  const sem = Number(balance?.sem ?? 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Saldo
        label="ZAM · canjeable"
        value={zam}
        description="Saldo canjeable por recompensas del catálogo."
        icon={<Coins className="size-5 text-verde" />}
        tone="border-l-verde"
      />
      <Saldo
        label="SEM · acumulado"
        value={sem}
        description="Desempeño verificado. No canjeable: es la base del cálculo de ZAM."
        icon={<Gem className="size-5 text-verde-osc" />}
        tone="border-l-verde-osc"
      />
      <Saldo
        label="Tope restante del período"
        value={Math.max(300 - zam, 0)}
        description="ZAM que aún puedes generar en este período académico (tope 300)."
        icon={<TrendingUp className="size-5 text-dorado" />}
        tone="border-l-dorado"
      />
    </div>
  );
}
