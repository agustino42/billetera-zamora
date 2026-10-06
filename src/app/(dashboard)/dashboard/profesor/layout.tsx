import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/session";

/** Guard de rol: solo docentes acreditados. */
export default async function ProfesorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  if (!profile) redirect("/auth/login");
  if (profile.status !== "active") redirect("/auth/activate");
  if (profile.role !== "teacher") redirect("/dashboard");

  return <>{children}</>;
}
