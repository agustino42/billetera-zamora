"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/shared/lib/supabase/client";
import { adjustmentSchema } from "@/shared/schemas";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

/**
 * Ajuste manual de saldo. Es la operación más delicada del panel: mueve el
 * saldo sin una nota que lo justifique, así que exige un motivo explícito
 * y queda firmado en el ledger con el actor y el saldo resultante.
 */
export function BalanceAdjustment({ studentId }: { studentId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [zam, setZam] = useState("");
  const [sem, setSem] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  async function submit() {
    const parsed = adjustmentSchema.safeParse({
      student_id: studentId,
      amount_zam: zam,
      amount_sem: sem,
      reason,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revisa los datos");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("apply_adjustment_event", {
      p_client_event_id: crypto.randomUUID(),
      p_profile_id: parsed.data.student_id,
      p_amount_zam: parsed.data.amount_zam,
      p_amount_sem: parsed.data.amount_sem,
      p_ref_type: "adjustment",
      p_ref_id: null,
      p_reason: parsed.data.reason,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Ajuste aplicado y firmado en la auditoría");
    setOpen(false);
    setZam("");
    setSem("");
    setReason("");
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Scale className="size-4" />
        Ajustar saldo
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar saldo</DialogTitle>
            <DialogDescription>
              Usa valores negativos para revertir saldo otorgado (por ejemplo,
              una nota que se corrigió tras una disputa). El saldo nunca puede
              quedar negativo y el movimiento queda encadenado en el ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="adj-zam">ZAM (puede ser negativo)</FieldLabel>
              <Input
                id="adj-zam"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={zam}
                onChange={(e) => setZam(e.target.value)}
                placeholder="-15"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="adj-sem">SEM (puede ser negativo)</FieldLabel>
              <Input
                id="adj-sem"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={sem}
                onChange={(e) => setSem(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="adj-reason">Motivo (obligatorio)</FieldLabel>
            <Textarea
              id="adj-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Corrección de nota CI-501 tras resolución de disputa #…"
            />
          </Field>

          <DialogFooter>
            <Button onClick={submit} disabled={saving || pending}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Aplicar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Envuelve un bloque de acciones de fila con refresco diferido. */
export function AdjustmentHint() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Corrección de saldos</CardTitle>
        <CardDescription>
          Cuando una disputa se resuelve como «corregida», revierte el saldo de
          la nota original con un ajuste negativo. Nunca edites `balances`
          directamente: el saldo debe explicarse con la suma de sus
          transacciones.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Cada ajuste se registra en <code>transactions</code> con tipo{" "}
        <code>adjust</code> y aparece en el ledger como{" "}
        <code>balance.adjusted</code>.
      </CardContent>
    </Card>
  );
}