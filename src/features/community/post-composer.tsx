"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/shared/lib/supabase/client";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Field, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

export function PostComposer() {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  async function publish(event: React.FormEvent) {
    event.preventDefault();

    if (body.trim().length < 10) {
      toast.error("Escribe al menos 10 caracteres");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Tu sesión expiró. Vuelve a iniciar sesión.");
      return;
    }

    const { error } = await supabase
      .from("community_posts")
      .insert({
        author_id: user.id,
        title: title.trim() || null,
        body: body.trim(),
        status: "pending",
      });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast("Publicado y enviado a moderación", {
      description: "Aparecerá en el feed cuando un moderador lo apruebe.",
    });
    setTitle("");
    setBody("");
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva publicación</CardTitle>
        <CardDescription>
          La comunidad es cerrada: solo usuarios acreditados. Toda publicación
          entra en moderación antes de ser visible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={publish} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="post-title">Título (opcional)</FieldLabel>
            <Input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              placeholder="Resumen en una línea"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="post-body">Mensaje</FieldLabel>
            <Textarea
              id="post-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Comparte una duda, un aviso o una recomendación."
              maxLength={2000}
              required
            />
          </Field>

          <Button type="submit" disabled={pending}>
            <Send className="size-4" />
            Publicar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}