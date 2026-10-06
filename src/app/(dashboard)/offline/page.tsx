import { OfflineQueuePanel } from "@/features/offline/offline-queue-panel";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          Trabajo sin conexión
        </h1>
        <p className="text-sm text-muted-foreground">
          Esta pantalla sigue disponible sin red: es la que debes abrir antes de
          entrar al aula.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cómo funciona la captura sin red</CardTitle>
          <CardDescription>
            1. Registra la calificación con el dispositivo sin conexión.
            <br />
            2. El evento se guarda en este dispositivo con un identificador
            único.
            <br />
            3. Al recuperar la señal se envía al servidor, que recalcula el
            saldo y firma el registro.
            <br />
            4. Si el evento ya había llegado, el servidor lo descarta sin
            duplicar saldo.
          </CardDescription>
        </CardHeader>
      </Card>

      <OfflineQueuePanel />
    </>
  );
}