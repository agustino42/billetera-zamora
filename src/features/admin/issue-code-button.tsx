"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { issueActivationCode } from "@/features/admin/actions";
import { Button } from "@/shared/ui/button";

export function IssueCodeButton({ email }: { email: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await issueActivationCode(email);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setCode(result.code ?? null);
      toast.success("Código emitido", {
        description: "Entrégaselo al usuario. Vence en 24 horas.",
      });
    });
  }

  if (code) {
    return (
      <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{code}</code>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={generate}
      disabled={pending}
      title={email}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
      Emitir código
    </Button>
  );
}
