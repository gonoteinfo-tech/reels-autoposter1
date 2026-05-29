import { NextResponse } from 'next/server';
import { initDatabase, getAppSettings } from '@/services/database';
import { getLoggedInUser } from '@/services/auth';
import { getSchedulerStatus, startScheduler, stopScheduler, runNow, isSchedulerActive } from '@/services/scheduler';
import type { ApiResponse } from '@/types';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * GET /api/scheduler
 * Retorna o status atual do scheduler com contadores personalizados do usuário logado.
 */
export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const user = await getLoggedInUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado. Faça login primeiro.' },
        { status: 401 }
      );
    }

    // Auto-iniciar scheduler se o cron job não estiver registrado
    if (!isSchedulerActive()) {
      try {
        startScheduler();
        console.log(`⏰ Scheduler auto-iniciado em segundo plano`);
      } catch (cronError) {
        console.error('❌ Falha ao auto-iniciar o scheduler:', cronError);
      }
    }

    // Obter status atualizado para o usuário logado
    const updatedStatus = getSchedulerStatus(user.id);

    return NextResponse.json({
      success: true,
      data: updatedStatus,
    });
  } catch (error) {
    console.error('❌ Erro ao buscar status do scheduler:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scheduler
 * Controla o scheduler: iniciar, parar (global) ou executar imediatamente (específico do usuário).
 */
export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const user = await getLoggedInUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado. Faça login primeiro.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action } = body as { action?: string };

    if (!action || !['start', 'stop', 'run-now'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'O campo "action" deve ser "start", "stop" ou "run-now"' },
        { status: 400 }
      );
    }

    const status = getSchedulerStatus(user.id);

    switch (action) {
      case 'start': {
        if (status.scheduler_active) {
          return NextResponse.json({
            success: true,
            message: 'O scheduler global já está ativo',
          });
        }

        startScheduler();
        return NextResponse.json({
          success: true,
          message: 'Scheduler iniciado com sucesso',
        });
      }

      case 'stop': {
        if (!status.scheduler_active) {
          return NextResponse.json({
            success: true,
            message: 'O scheduler global já está parado',
          });
        }

        stopScheduler();
        return NextResponse.json({
          success: true,
          message: 'Scheduler parado com sucesso',
        });
      }

      case 'run-now': {
        // Executar pipeline especificamente para o usuário logado de forma assíncrona
        runNow(user.id).catch(console.error);

        return NextResponse.json({
          success: true,
          message: 'Execução manual do pipeline iniciada para o seu perfil',
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Ação desconhecida' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('❌ Erro ao controlar scheduler:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
