import { redirect } from "next/navigation";
import { getLoggedInUser } from "@/services/auth";
import SettingsClient from "@/components/SettingsClient";

export default async function SettingsPage() {
  const user = await getLoggedInUser();

  if (!user) {
    redirect("/");
  }

  return <SettingsClient user={user} />;
}
