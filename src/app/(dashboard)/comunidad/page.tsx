import { createClient } from "@/shared/lib/supabase/server";
import { getProfile } from "@/features/auth/session";
import { PostComposer } from "@/features/community/post-composer";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { timeAgo } from "@/shared/utils/format";

export const metadata = { title: "Comunidad" };

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  published: { label: "Publicado", variant: "default" },
  pending: { label: "En moderación", variant: "secondary" },
  blocked: { label: "Bloqueado", variant: "destructive" },
  removed: { label: "Retirado", variant: "destructive" },
};

export default async function ComunidadPage() {
  const profile = await getProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("community_posts")
    .select("id, author_id, title, body, status, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  const posts = data ?? [];
  const authorIds = [...new Set(posts.map((p) => p.author_id))];

  const { data: people } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] };

  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Comunidad</h1>
        <p className="text-sm text-muted-foreground">
          Espacio cerrado para la comunidad académica acreditada.
        </p>
      </div>

      <PostComposer />

      <Card>
        <CardHeader>
          <CardTitle>Publicaciones recientes</CardTitle>
          <CardDescription>
            Ves tus propias publicaciones aunque estén en moderación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {posts.length === 0 ? (
            <EmptyState
              title="Sin publicaciones"
              description="Sé la primera persona en escribir en la comunidad."
            />
          ) : (
            posts.map((post) => {
              const badge = STATUS_BADGE[post.status] ?? STATUS_BADGE.pending;
              const mine = post.author_id === profile!.id;
              return (
                <article key={post.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {nameById.get(post.author_id) ?? "Usuario"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(post.created_at)}
                    </span>
                    <Badge variant={badge.variant} className="ml-auto">
                      {badge.label}
                    </Badge>
                    {mine ? <Badge variant="outline">tú</Badge> : null}
                  </div>
                  {post.title ? (
                    <h2 className="mt-2 font-medium">{post.title}</h2>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {post.body}
                  </p>
                </article>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
}