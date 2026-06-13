import { redirect } from "next/navigation";
import { getLoggedInUser } from "@/services/auth";
import SourcesClient from "@/components/SourcesClient";

export default async function SourcesPage() {
  const user = await getLoggedInUser();

  if (!user) {
    redirect("/?error=not_authenticated");
  }

  return <SourcesClient user={user} />;
}
