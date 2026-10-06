import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/session";
import { AppNav } from "@/features/auth/app-nav";
import { OfflineBanner } from "@/features/offline/offline-banner";

/**
 * Shell de los tres portales: exige perfil acreditado y monta la
 * navegación por rol. El guard de rol específico vive en cada subcarpeta.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  if (!profile) redirect("/auth/login");
  if (profile.status !== "active") redirect("/auth/activate");

  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav profile={profile} />
      <OfflineBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
