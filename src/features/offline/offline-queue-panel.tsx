"use client";

import { useEffect } from "react";
import { CloudOff, Loader2, RefreshCw, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { useOfflineQueue } from "@/stores/offline-queue";
import { removeItem } from "@/services/offline/queue";
import { ALLOW_DELETE } from "@/shared/constants/routes";
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
import { SYNC_STATUS_LABEL } from "@/shared/constants/domain";
import { formatDateTime } from "@/shared/utils/format";

export function OfflineQueuePanel() {
  const { items, online, syncing, hydrated, sync, hydrate, setOnline } =
    useOfflineQueue();

  useEffect(() => {
    void hydrate();
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [hydrate, setOnline]);

  async function manualSync() {
    const result = await sync();

    if (result.sent === 0) {
      toast.info("No hay nada pendiente por enviar");
      return;
    }

    if (result.failed === 0) {
      toast.success(`${result.applied} registro(s) sincronizados`);
    } else {
      toast.error(
        `${result.applied} sincronizados, ${result.failed} con error. Revisa la cola.`,
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {online ? (
            <>
              <Wifi className="size-4 text-verde" /> Conectado
            </>
          ) : (
            <>
              <CloudOff className="size-4 text-destructive" /> Sin conexión
            </>
          )}
          {items.length > 0 ? (
            <Badge variant="secondary">{items.length} en cola</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Los registros creados sin red se guardan cifrados en este
          dispositivo y se envían solos al recuperar la señal. Cada envío lleva
          un <code>client_event_id</code>: si se repite, el servidor lo
          descarta en lugar de duplicar saldo.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Button onClick={manualSync} disabled={!online || syncing || !hydrated}>
          {syncing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Sincronizar ahora
        </Button>

        {!hydrated ? (
          <p className="text-sm text-muted-foreground">Cargando cola local…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="Cola vacía"
            description="Todo lo que registres sin conexión aparecerá aquí."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.client_event_id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {item.type === "grade" ? "calificación" : "asistencia"}
                    </Badge>
                    <Badge
                      variant={
                        item.status === "failed"
                          ? "destructive"
                          : item.status === "synced"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {SYNC_STATUS_LABEL[item.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(item.created_at)} ·{" "}
                    <code>{item.client_event_id.slice(0, 8)}</code>
                    {item.retries > 0 ? ` · ${item.retries} reintento(s)` : ""}
                  </p>
                  {item.error ? (
                    <p className="mt-1 text-xs text-destructive">{item.error}</p>
                  ) : null}
                </div>

                {ALLOW_DELETE ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeItem(item.client_event_id).then(hydrate)}
                    title="Descartar evento"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}