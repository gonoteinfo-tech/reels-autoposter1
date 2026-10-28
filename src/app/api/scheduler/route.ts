import { NextResponse } from "next/server";
import { getLoggedInUser } from "@/services/auth";
import {
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  runNow,
} from "@/services/scheduler";
import { safeError } from "@/services/jobs";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getLoggedInUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: "Faça login primeiro." },
      { status: 401 },
    );
  return NextResponse.json({
    success: true,
    data: getSchedulerStatus(user.id),
  });
}
export async function POST(request: Request) {
  const user = await getLoggedInUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: "Faça login primeiro." },
      { status: 401 },
    );
  try {
    const { action } = await request.json();
    if (action === "run-now") {
      const jobs = runNow(user.id);
      return NextResponse.json(
        {
          success: true,
          message: jobs.length
            ? "Tarefas registradas na fila. Acompanhe o estado abaixo."
            : "Nenhuma fonte ou vídeo pendente para executar.",
          data: { jobs },
        },
        { status: 202 },
      );
    }
    const admins = (process.env.ADMIN_EMAIL || "")
      .split(",")
      .map((s) => s.trim().toLowerCase());
    if (!["start", "stop"].includes(action))
      return NextResponse.json(
        { success: false, error: "Ação inválida." },
        { status: 400 },
      );
    if (user.id !== 1 && !admins.includes(user.email.toLowerCase()))
      return NextResponse.json(
        {
          success: false,
          error: "Somente o administrador pode pausar o worker.",
        },
        { status: 403 },
      );
    if (action === "start") startScheduler();
    else stopScheduler();
    return NextResponse.json({
      success: true,
      message:
        action === "start"
          ? "Automação habilitada."
          : "Novas tarefas pausadas; a operação atual terminará.",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: safeError(error) },
      { status: 400 },
    );
  }
}
