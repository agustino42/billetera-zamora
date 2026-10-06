"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import type { ChainVerificationRow } from "@/shared/types/domain";

type VerifyResponse = {
  total: number;
  ok: boolean;
  broken: number;
  signature_verified_in: string;
  cross_checked_in: string;
  detail: ChainVerificationRow[];
};

export function ChainVerifier() {
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function verify() {
    setLoading(true);
    try {
      const response = await fetch("/api/audit/verify");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as VerifyResponse;
      setData(json);

      if (json.ok) {
        toast.success(`Cadena íntegra: ${json.total} registros verificados`);
      } else {
        toast.error(`${json.broken} eslabones con inconsistencias`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo verificar",
      );
    } finally {
      setLoading(false);
    }
  }

  // Verificación inicial al montar: solo lectura, sin dependencias.
  useEffect(() => {
    void verify();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {data?.ok === false ? (
            <ShieldAlert className="size-5 text-destructive" />
          ) : (
            <ShieldCheck className="size-5 text-verde" />
          )}
          Integridad de la cadena
        </CardTitle>
        <CardDescription>
          Recalcula cada hash, verifica el enlace con el registro anterior y
          comprueba la firma HMAC de toda la cadena.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Button onClick={verify} disabled={loading} variant="outline">
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Verificar ahora
        </Button>

        {data ? (
          <>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="outline">{data.total} registros</Badge>
              <Badge variant={data.ok ? "default" : "destructive"}>
                {data.ok ? "Cadena íntegra" : `${data.broken} inconsistencias`}
              </Badge>
              {data.signature_verified_in ? (
                <Badge variant="outline">
                  firma verificada en {data.signature_verified_in}
                </Badge>
              ) : null}
              {data.cross_checked_in ? (
                <Badge variant="outline">
                  recálculo en {data.cross_checked_in}
                </Badge>
              ) : null}
            </div>

            {data.detail.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {data.detail.slice(0, 8).map((row) => (
                  <li
                    key={row.seq}
                    className="flex items-center gap-2 rounded border px-2 py-1"
                  >
                    <span
                      className={
                        row.ok ? "text-verde" : "font-medium text-destructive"
                      }
                    >
                      #{row.seq}
                    </span>
                    <span className="text-muted-foreground">{row.detail}</span>
                    {row.ok ? (
                      <CheckCircle2 className="ml-auto size-3 text-verde" />
                    ) : (
                      <ShieldAlert className="ml-auto size-3 text-destructive" />
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
