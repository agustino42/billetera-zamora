"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, Send } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/shared/lib/supabase/client";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";

const TARGET_LABEL: Record<string, string> = {
  all: "Toda la comunidad",
  students: "Solo estudiantes",
  teachers: "Solo docentes",
  admins: "Solo administración",
};

/**
 * Los anuncios salen por `save_announcement` para que la publicación quede
 * firmada; escribir la tabla directamente funcionaría por RLS, pero dejaría
 * la decisión fuera del ledger.
 */
export function AnnouncementComposer() {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("all");
  const [expires, setExpires] = useState("");
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function publish(event: React.FormEvent) {
    event.preventDefault();

    if (title.trim().length < 5 || body.trim().length < 10) {
      toast.error("El anuncio necesita título y mensaje con contenido");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("save_announcement", {
      p_id: null,
      p_title: title.trim(),
      p_body: body.trim(),
      p_target: target,
      p_status: "published",
      p_expires_at: expires ? new Date(expires).toISOString() : null,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Anuncio publicado y firmado en la auditoría", {
      description: expires
        ? "Dejará de mostrarse en la fecha indicada."
        : "Visible para toda la comunidad acreditada.",
    });
    setTitle("");
    setBody("");
    setExpires("");
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-4 text-dorado" />
          Publicar anuncio
        </CardTitle>
        <CardDescription>
          Aparece en el inicio de cada portal según el destinatario elegido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={publish} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="ann-title">Título</FieldLabel>
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              placeholder="Convocatoria de beca 2026"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="ann-body">Mensaje</FieldLabel>
            <Textarea
              id="ann-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              placeholder="Detalla la convocatoria, fechas y requisitos."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ann-target">Destinatario</FieldLabel>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="ann-target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TARGET_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="ann-expires">
                Vence (opcional)
              </FieldLabel>
              <Input
                id="ann-expires"
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </Field>
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Publicar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}