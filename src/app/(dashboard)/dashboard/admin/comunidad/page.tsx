import { createClient } from "@/shared/lib/supabase/server";
import {
  CommunityModeration,
  PostStatusBadge,
} from "@/features/admin/community-moderation";
import { AnnouncementComposer } from "@/features/admin/announcement-composer";
import { Card, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { formatDateTime } from "@/shared/utils/format";

export const metadata = { title: "Comunidad y anuncios" };

export default async function ComunidadAdminPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("community_posts")
    .select(
      "id, author_id, title, body, status, moderation_reason, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(60);

  const posts = data ?? [];
  const authorIds = [...new Set(posts.map((p) => p.author_id))];

  const { data: people } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds)
    : { data: [] };

  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          Comunidad y anuncios
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada decisión de moderación queda en el registro de moderación y
          firmada en el ledger.
        </p>
      </div>

      <AnnouncementComposer />

      <Card>
        <CardHeader>
          <CardTitle>Moderación de publicaciones</CardTitle>
          <CardDescription>
            {posts.filter((p) => p.status === "pending").length} en cola.
          </CardDescription>
        </CardHeader>

        {posts.length === 0 ? (
          <EmptyState
            title="Sin publicaciones"
            description="Las entradas de la comunidad aparecerán aquí para moderarse."
            className="mx-6 mb-6"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Autor</TableHead>
                <TableHead>Publicación</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id} className="align-top">
                  <TableCell className="whitespace-nowrap">
                    {nameById.get(post.author_id) ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{post.title ?? "Sin título"}</div>
                    <p className="max-w-prose text-sm text-muted-foreground">
                      {post.body.length > 160
                        ? `${post.body.slice(0, 160)}…`
                        : post.body}
                    </p>
                    {post.moderation_reason ? (
                      <p className="mt-1 text-xs text-destructive">
                        Motivo previo: {post.moderation_reason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <PostStatusBadge status={post.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(post.created_at)}
                  </TableCell>
                  <TableCell>
                    <CommunityModeration
                      postId={post.id}
                      authorName={nameById.get(post.author_id) ?? "El autor"}
                      status={post.status}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}