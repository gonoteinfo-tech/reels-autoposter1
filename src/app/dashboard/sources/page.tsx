import { redirect } from "next/navigation";
import { getLoggedInUser } from "@/services/auth";
import SourcesClient from "@/components/SourcesClient";

export default async function SourcesPage() {
  const user = await getLoggedInUser();

  if (!user) {
    redirect("/");
  }

  return <SourcesClient user={user} />;
}
