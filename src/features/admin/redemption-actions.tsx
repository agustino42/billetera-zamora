"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PackageCheck, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/shared/lib/supabase/client";
import { Button } from "@/shared/ui/button";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Textarea } from "@/shared/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

type Action = "approve" | "reject" | "fulfill";

export function RedemptionActions({
  redemptionId,
  studentName,
  rewardName,
  status,
}: {
  redemptionId: string;
  studentName: string;
  rewardName: string;
  status: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);

  async function settle(action: Action, why?: string) {
    setBusy(action);
    const { error } = await supabase.rpc("settle_redemption", {
      p_redemption_id: redemptionId,
      p_action: action,
      p_reason: why ?? null,
    });
    setBusy(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      action === "reject"
        ? "Canje rechazado: el ZAM fue devuelto al estudiante"
        : action === "fulfill"
          ? "Canje marcado como entregado"
          : "Canje aprobado",
    );
    setRejecting(false);
    setReason("");
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-2">
      {status === "pending" ? (
        <>
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => settle("approve")}
          >
            {busy === "approve" ? "…" : "Aprobar"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => setRejecting(true)}
          >
            Rechazar
          </Button>
        </>
      ) : null}

      {status === "approved" ? (
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={() => settle("fulfill")}
        >
          <PackageCheck className="size-4" />
          {busy === "fulfill" ? "…" : "Entregar"}
        </Button>
      ) : null}

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar canje</DialogTitle>
            <DialogDescription>
              {studentName} recuperará {rewardName} automáticamente. El motivo
              queda firmado en el registro de auditoría.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor={`reason-${redemptionId}`}>Motivo</FieldLabel>
            <Textarea
              id={`reason-${redemptionId}`}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Sin existencias, canje fuera de plazo, otro motivo…"
            />
          </Field>

          <DialogFooter>
            <Button
              variant="destructive"
              disabled={busy !== null || reason.trim().length < 5}
              onClick={() => settle("reject", reason.trim())}
            >
              <X className="size-4" />
              Rechazar y devolver ZAM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ApprovedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-verde">
      <Check className="size-3" /> listo
    </span>
  );
}