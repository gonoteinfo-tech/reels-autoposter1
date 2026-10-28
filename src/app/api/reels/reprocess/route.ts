import { NextResponse } from "next/server";
import { getLoggedInUser } from "@/services/auth";
import { getReelsByStage } from "@/services/database";
import { enqueueReel } from "@/services/pipeline";
import { safeError } from "@/services/jobs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const user = await getLoggedInUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: "Faça login primeiro." },
      { status: 401 },
    );
  try {
    const { reelId, allFailed } = await request.json();
    if (allFailed !== true && (!Number.isSafeInteger(reelId) || reelId < 1))
      return NextResponse.json(
        { success: false, error: "Informe um Reel válido ou allFailed=true." },
        { status: 400 },
      );
    const ids =
      allFailed === true
        ? getReelsByStage(user.id, "error").map((r) => r.id)
        : [reelId];
    const jobs = ids.map((id) => enqueueReel(user.id, id, true));
    return NextResponse.json(
      {
        success: true,
        message: `${jobs.length} tarefa(s) registrada(s). Resultados incertos permanecem em revisão.`,
        data: { jobs, count: jobs.length },
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
