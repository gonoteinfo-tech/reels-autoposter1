import { NextResponse } from "next/server";
import { initDatabase } from "@/services/database";
import { getDashboardSummary } from "@/services/dashboard";
import { getLoggedInUser } from "@/services/auth";
import type { ApiResponse } from "@/types";

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * GET /api/stats
 * Retorna estatísticas para o dashboard do usuário logado.
 */
export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const user = await getLoggedInUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Não autorizado. Faça login primeiro." },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      data: getDashboardSummary(user.id),
    });
  } catch (error) {
    console.error("❌ Erro ao buscar estatísticas:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Erro interno do servidor",
      },
      { status: 500 },
    );
  }
}
