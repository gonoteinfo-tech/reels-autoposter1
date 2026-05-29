import { NextResponse } from 'next/server';
import {
  initDatabase,
  getAllSources,
  getSourceByUsername,
  getSourceById,
  createSource,
  deleteSource,
} from '@/services/database';
import { getLoggedInUser } from '@/services/auth';
import type { ApiResponse } from '@/types';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * GET /api/sources
 * Lista todos os perfis-fonte cadastrados do usuário logado.
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

    const sources = getAllSources(user.id);

    return NextResponse.json({
      success: true,
      data: { sources },
    });
  } catch (error) {
    console.error('❌ Erro ao listar sources:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sources
 * Adiciona um novo perfil-fonte para monitoramento do usuário logado.
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
    const { username, platform } = body as { username?: string; platform?: 'instagram' | 'tiktok' | 'facebook' | 'youtube' };

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { success: false, error: 'O campo "username" é obrigatório e deve ser uma string válida' },
        { status: 400 }
      );
    }

    const activePlatform = platform || 'instagram';
    const validPlatforms = ['instagram', 'tiktok', 'facebook', 'youtube'];
    if (!validPlatforms.includes(activePlatform)) {
      return NextResponse.json(
        { success: false, error: 'Plataforma inválida. Escolha entre instagram, tiktok, facebook ou youtube' },
        { status: 400 }
      );
    }

    // Limpar o username: remover @ e espaços
    const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();

    if (!cleanUsername || cleanUsername.length < 1) {
      return NextResponse.json(
        { success: false, error: 'Username inválido' },
        { status: 400 }
      );
    }

    // Validar formato do username (mais permissivo para TikTok/YouTube/Facebook)
    const usernamePattern = /^[a-zA-Z0-9._-]{1,50}$/;
    if (!usernamePattern.test(cleanUsername)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Username inválido. Use apenas letras, números, pontos, traços e underscores (máx. 50 caracteres)',
        },
        { status: 400 }
      );
    }

    // Verificar se já existe para este usuário nesta plataforma
    const existing = getSourceByUsername(cleanUsername, user.id, activePlatform);
    if (existing) {
      return NextResponse.json(
        { success: false, error: `O perfil @${cleanUsername} já está cadastrado para sua conta no ${activePlatform}` },
        { status: 409 }
      );
    }

    const source = createSource({
      username: cleanUsername,
      platform: activePlatform,
      display_name: `@${cleanUsername}`,
      user_id: user.id
    });

    return NextResponse.json(
      { success: true, data: { source } },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ Erro ao criar source:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sources
 * Remove um perfil-fonte pelo ID do usuário logado.
 */
export async function DELETE(request: Request): Promise<NextResponse<ApiResponse>> {
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
    const { id } = body as { id?: number };

    if (!id || typeof id !== 'number') {
      return NextResponse.json(
        { success: false, error: 'O campo "id" é obrigatório e deve ser um número' },
        { status: 400 }
      );
    }

    // Verificar se existe para este usuário
    const source = getSourceById(id, user.id);
    if (!source) {
      return NextResponse.json(
        { success: false, error: `Perfil-fonte com ID ${id} não encontrado ou não pertence a você` },
        { status: 404 }
      );
    }

    const deleted = deleteSource(id, user.id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Não foi possível remover o perfil-fonte' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Perfil @${source.username} removido com sucesso`,
    });
  } catch (error) {
    console.error('❌ Erro ao remover source:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
