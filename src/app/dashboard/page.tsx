import { redirect } from "next/navigation";
import { getLoggedInUser } from "@/services/auth";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const user = await getLoggedInUser();

  if (!user) {
    redirect("/?error=not_authenticated");
  }

  return <DashboardClient user={user} />;
}
