"use client";

import Link from "next/link";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useOfflineQueue } from "@/stores/offline-queue";
import { summarize } from "@/services/offline/queue";
import { Button } from "@/shared/ui/button";

/**
 * Aviso permanente de modo sin conexión + conteo de eventos pendientes.
 * Es el estado que el docente ve en el salón sin cobertura.
 */
export function OfflineBanner() {
  const online = useOfflineQueue((s) => s.online);
  const items = useOfflineQueue((s) => s.items);
  const sync = useOfflineQueue((s) => s.sync);
  const syncing = useOfflineQueue((s) => s.syncing);

  const pending = summarize(items);
  const showBanner = !online || pending.total > 0;

  if (!showBanner) return null;

  return (
    <div
      className={
        online
          ? "border-b border-dorado/40 bg-dorado/10"
          : "border-b border-destructive/40 bg-destructive/10"
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <span className="flex items-center gap-2">
          {online ? (
            <RefreshCw className={syncing ? "size-4 animate-spin" : "size-4 text-dorado"} />
          ) : (
            <CloudOff className="size-4 text-destructive" />
          )}
          <span className="font-medium">
            {online ? "Sincronización pendiente" : "Modo sin conexión"}
          </span>
        </span>

        <span className="text-muted-foreground">
          {pending.total === 0
            ? "Todos los registros están sincronizados."
            : `${pending.total} evento${pending.total === 1 ? "" : "s"} en cola` +
              (pending.failed > 0 ? ` · ${pending.failed} con error` : "")}
        </span>

        {pending.failed > 0 ? (
          <TriangleAlert className="size-4 text-destructive" />
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/offline">Ver cola</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void sync()}
            disabled={!online || syncing}
          >
            <RefreshCw className={syncing ? "size-4 animate-spin" : "size-4"} />
            Sincronizar ahora
          </Button>
        </div>
      </div>
    </div>
  );
}
