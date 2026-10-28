import { NextResponse } from "next/server";
import { initDatabase, getDashboardStats } from "@/services/database";
import { getLoggedInUser } from "@/services/auth";
import type { DashboardStats, ApiResponse } from "@/types";

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

    const dbStats = getDashboardStats(user.id);

    const stats: DashboardStats = {
      ...dbStats,
      storage_used_mb: dbStats.storage_used_mb,
    };

    return NextResponse.json({
      success: true,
      data: stats,
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
