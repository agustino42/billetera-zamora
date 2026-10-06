"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/shared/lib/supabase/client";
import { Badge } from "@/shared/ui/badge";
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
import { Textarea } from "@/shared/ui/textarea";

export type ModerationAction = "approve" | "block" | "restore" | "remove";

export const POST_STATUS_LABEL: Record<string, string> = {
  pending: "En moderación",
  published: "Publicado",
  blocked: "Bloqueado",
  removed: "Retirado",
};

const NEEDS_REASON: ModerationAction[] = ["block", "remove"];

/**
 * Moderación de la comunidad. Todo pasa por `moderate_community_post`: la
 * política RLS ya permite a un admin escribir `community_posts`, pero usar el
 * RPC garantiza además la entrada en `moderation_logs` y la firma en el
 * ledger, que es lo que hace auditable la decisión.
 */
export function CommunityModeration({
  postId,
  authorName,
  status,
}: {
  postId: string;
  authorName: string;
  status: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [asking, setAsking] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<ModerationAction | null>(null);
  const [pending, startTransition] = useTransition();

  async function moderate(action: ModerationAction, why?: string) {
    setBusy(action);
    const { error } = await supabase.rpc("moderate_community_post", {
      p_post_id: postId,
      p_action: action,
      p_reason: why ?? null,
    });
    setBusy(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(
      action === "approve"
        ? "Publicación aprobada"
        : action === "restore"
          ? "Publicación restaurada"
          : action === "block"
            ? "Publicación bloqueada"
            : "Publicación retirada",
    );
    setAsking(null);
    setReason("");
    startTransition(() => router.refresh());
  }

  function run(action: ModerationAction) {
    if (NEEDS_REASON.includes(action)) {
      setAsking(action);
      return;
    }
    void moderate(action);
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status === "pending" ? (
        <Button
          size="sm"
          disabled={busy !== null || pending}
          onClick={() => run("approve")}
        >
          {busy === "approve" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          Aprobar
        </Button>
      ) : null}

      {status === "published" ? (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || pending}
            onClick={() => run("block")}
          >
            <EyeOff className="size-4" />
            Bloquear
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null || pending}
            onClick={() => run("remove")}
          >
            <Trash2 className="size-4" />
            Retirar
          </Button>
        </>
      ) : null}

      {status === "blocked" || status === "removed" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null || pending}
          onClick={() => run("restore")}
        >
          <RotateCcw className="size-4" />
          Restaurar
        </Button>
      ) : null}

      <Dialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {asking === "block" ? "Bloquear publicación" : "Retirar publicación"}
            </DialogTitle>
            <DialogDescription>
              {authorName} recibe el motivo y la publicación sale del feed. La
              acción queda en `moderation_logs` y firmada en el ledger.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor={`reason-${postId}`}>Motivo</FieldLabel>
            <Textarea
              id={`reason-${postId}`}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Lenguaje fuera de tono, información personal, spam…"
              maxLength={300}
            />
          </Field>

          <DialogFooter>
            <Button
              variant="destructive"
              disabled={busy !== null || reason.trim().length < 5}
              onClick={() => asking && moderate(asking, reason.trim())}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PostStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "published"
          ? "default"
          : status === "pending"
            ? "secondary"
            : "destructive"
      }
    >
      {POST_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}