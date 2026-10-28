import { NextResponse } from "next/server";
import { getLoggedInUser } from "@/services/auth";
import { enqueueSource } from "@/services/pipeline";
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
    const { sourceId } = await request.json();
    if (!Number.isSafeInteger(sourceId) || sourceId < 1)
      return NextResponse.json(
        { success: false, error: "ID da fonte inválido." },
        { status: 400 },
      );
    const job = enqueueSource(user.id, sourceId, true);
    return NextResponse.json(
      {
        success: true,
        message:
          job.status === "needs_review"
            ? "Coleta aguardando revisão do resultado remoto."
            : "Sincronização registrada na fila.",
        data: { job, pending: true },
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
