import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/session";
import { ROLE_HOME } from "@/shared/constants/routes";

/** /dashboard sin destino: cada rol aterriza en su portal. */
export default async function DashboardIndexPage() {
  const profile = await getProfile();
  if (!profile) redirect("/auth/login");
  redirect(profile.status === "active" ? ROLE_HOME[profile.role] : "/auth/activate");
}
