"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/shared/lib/supabase/client";
import { ROLE_LABEL } from "@/shared/constants/domain";
import type { ProfileStatus, Role } from "@/shared/types/domain";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { ShieldAlert } from "lucide-react";

const ROLES: Role[] = ["student", "teacher", "admin"];
const STATUSES: ProfileStatus[] = ["pending", "active", "suspended"];

/**
 * Cambio de rol/estado desde el panel. Lo permite el trigger
 * anti-escalación únicamente cuando quien escribe es admin activo; el
 * cliente nunca puede saltárselo porque el RPC no existe para esto.
 */
export function RoleBadge({
  profileId,
  role,
  status,
}: {
  profileId: string;
  role: Role;
  status: ProfileStatus;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();

  async function update(patch: { role?: Role; status?: ProfileStatus }) {
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", profileId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Perfil actualizado");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={role} onValueChange={(v) => update({ role: v as Role })}>
        <SelectTrigger
          size="sm"
          className="h-8 w-28"
          aria-label={`Rol de ${ROLE_LABEL[role]}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status}
        onValueChange={(v) => update({ status: v as ProfileStatus })}
      >
        <SelectTrigger size="sm" className="h-8 w-28" aria-label="Estado">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {pending ? <span className="text-xs text-muted-foreground">…</span> : null}

      {role !== "student" ? (
        <span title="Solo estudiantes pueden tener saldo">
          <ShieldAlert className="size-3.5 text-dorado" />
        </span>
      ) : null}
    </div>
  );
}