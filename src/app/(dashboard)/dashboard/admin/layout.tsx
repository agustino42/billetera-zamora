import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/session";

/** Guard de rol: solo administración acreditada. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  if (!profile) redirect("/auth/login");
  if (profile.status !== "active") redirect("/auth/activate");
  if (profile.role !== "admin") redirect("/dashboard");

  return <>{children}</>;
}
