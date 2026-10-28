import { NextResponse } from "next/server";
import { getLoggedInUser } from "@/services/auth";
import { getReelById } from "@/services/database";
import { getQueue } from "@/services/pipeline";
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
    const { reelId, targets } = await request.json();
    if (
      !Number.isSafeInteger(reelId) ||
      reelId < 1 ||
      !Array.isArray(targets) ||
      !targets.length ||
      targets.some((t) => !["instagram", "facebook"].includes(t))
    )
      return NextResponse.json(
        { success: false, error: "Reel ou destinos inválidos." },
        { status: 400 },
      );
    const reel = getReelById(reelId, user.id);
    if (!reel)
      return NextResponse.json(
        { success: false, error: "Reel não encontrado." },
        { status: 404 },
      );
    if (!reel.r2_url)
      return NextResponse.json(
        { success: false, error: "Prepare o vídeo antes de publicar." },
        { status: 422 },
      );
    const q = getQueue();
    const jobs = [...new Set<string>(targets)].map((target) =>
      q.enqueue(user.id, "publish", reelId, { target, manual: true }, true),
    );
    return NextResponse.json(
      {
        success: true,
        message:
          "Publicação registrada na fila. Confira o resultado por destino.",
        data: { jobs },
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
