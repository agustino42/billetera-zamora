"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/shared/lib/supabase/client";
import { resolveDisputeSchema } from "@/shared/schemas";
import { DISPUTE_STATUS_LABEL } from "@/shared/constants/domain";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Field, FieldLabel } from "@/shared/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";

const RESOLUTIONS = [
  "resolved_upheld",
  "resolved_corrected",
  "rejected",
  "closed",
] as const;

export function DisputeResolutionButton({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>("resolved_corrected");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);

  async function resolve() {
    const parsed = resolveDisputeSchema.safeParse({
      dispute_id: disputeId,
      status,
      resolution,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revisa los datos");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("resolve_grade_dispute", {
      p_dispute_id: parsed.data.dispute_id,
      p_status: parsed.data.status,
      p_resolution: parsed.data.resolution,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Disputa resuelta y registrada en la auditoría");
    setOpen(false);
    setResolution("");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Resolver
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver disputa</DialogTitle>
            <DialogDescription>
              Si la nota debe corregirse, registra el ajuste de saldo con
              <span className="font-medium"> apply_adjustment_event</span> para
              compensar el saldo otorgado.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="resolution-status">Resultado</FieldLabel>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="resolution-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {DISPUTE_STATUS_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="resolution-text">Resolución</FieldLabel>
            <Textarea
              id="resolution-text"
              rows={4}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Documenta la evidencia revisada y la decisión tomada."
            />
          </Field>

          <DialogFooter>
            <Button onClick={resolve} disabled={saving}>
              {saving ? "Guardando…" : "Confirmar resolución"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
