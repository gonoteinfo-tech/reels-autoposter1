import { NextResponse } from "next/server";
import { getLoggedInUser } from "@/services/auth";
import { getQueue } from "@/services/pipeline";
import { reviewJob } from "@/services/job-review";
import { safeError } from "@/services/jobs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getLoggedInUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: "Faça login primeiro." },
      { status: 401 },
    );
  const q = getQueue(),
    id = new URL(request.url).searchParams.get("id");
  if (!id)
    return NextResponse.json(
      { success: false, error: "Informe o ID da tarefa." },
      { status: 400 },
    );
  const job = q.get(id, user.id);
  if (!job)
    return NextResponse.json(
      { success: false, error: "Tarefa não encontrada." },
      { status: 404 },
    );
  const events = q.db
    .prepare(
      "SELECT status,message,created_at FROM pipeline_events WHERE job_id=? AND user_id=? ORDER BY id DESC LIMIT 50",
    )
    .all(id, user.id);
  return NextResponse.json({ success: true, data: { job, events } });
}
export async function POST(request: Request) {
  const user = await getLoggedInUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: "Faça login primeiro." },
      { status: 401 },
    );
  try {
    const { jobId, action, postId } = await request.json();
    if (
      typeof jobId !== "string" ||
      typeof action !== "string" ||
      (postId !== undefined && typeof postId !== "string")
    )
      throw new Error("Revisão inválida.");
    reviewJob(getQueue(), user.id, jobId, action, postId);
    return NextResponse.json(
      {
        success: true,
        message:
          "Revisão registrada. A tarefa seguirá a confirmação informada.",
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: safeError(error) },
      { status: 400 },
    );
  }
}
