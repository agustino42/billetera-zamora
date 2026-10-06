import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/session";

/** Guard de rol: solo estudiantes acreditados. */
export default async function EstudianteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  if (!profile) redirect("/auth/login");
  if (profile.status !== "active") redirect("/auth/activate");
  if (profile.role !== "student") redirect("/dashboard");

  return <>{children}</>;
}
