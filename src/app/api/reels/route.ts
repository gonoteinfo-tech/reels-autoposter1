import { NextResponse } from 'next/server';
import {
  initDatabase,
  getSourceByUsername,
  createSource,
  createReel,
  getReelByUrl,
  getReelByInstagramId,
  getDb,
  getReelById,
  deleteReel,
} from '@/services/database';
import { getLoggedInUser } from '@/services/auth';
import { extractVideoId } from '@/services/instagram-downloader';
import fs from 'fs';
import type { Reel, ReelStage, ApiResponse } from '@/types';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * GET /api/reels
 * Lista todos os reels do usuário logado com paginação e filtros opcionais.
 */
export async function GET(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    ensureDb();
    const user = await getLoggedInUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado. Faça login primeiro.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));
    const stage = searchParams.get('stage') as ReelStage | null;
    const sourceId = searchParams.get('source_id');

    const database = getDb();
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [user.id];

    if (stage) {
      conditions.push('stage = ?');
      params.push(stage);
    }

    if (sourceId) {
      conditions.push('source_id = ?');
      params.push(Number(sourceId));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Contar total de registros do usuário
    const countRow = database
      .prepare(`SELECT COUNT(*) as count FROM reels ${whereClause}`)
      .get(...params) as { count: number };
    const total = countRow.count;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Buscar reels do usuário com paginação
    const reels = database
      .prepare(
        `SELECT * FROM reels ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Reel[];

    return NextResponse.json({
      success: true,
      data: {
        reels,
        total,
        page,
        totalPages,
      },
    });
  } catch (error) {
    console.error('❌ Erro ao listar reels:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reels
 * Adiciona um reel manualmente pela URL do Instagram.
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
    const { url, caption } = body as { url?: string; caption?: string };

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'O campo "url" é obrigatório e deve ser uma string válida' },
        { status: 400 }
      );
    }

    // Validar formato da URL
    const isInstagram = /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p)\//i.test(url);
    const isTikTok = /^https?:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9._-]+\/video\/\d+/i.test(url) || /^https?:\/\/(vt|vm)\.tiktok\.com\//i.test(url);
    const isYouTube = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
    const isFacebook = /^https?:\/\/(www\.)?facebook\.com\//i.test(url);

    if (!isInstagram && !isTikTok && !isYouTube && !isFacebook) {
      return NextResponse.json(
        { success: false, error: 'URL inválida. Deve ser uma URL do Instagram, TikTok, YouTube ou Facebook' },
        { status: 400 }
      );
    }

    // Links do Instagram costumam vir com parâmetros de rastreamento (?igsh=...) — remover
    let cleanUrl = url.trim();
    if (isInstagram) {
      try {
        const parsed = new URL(cleanUrl);
        cleanUrl = `${parsed.origin}${parsed.pathname}`.replace(/\/?$/, '/');
      } catch {
        // mantém a URL original
      }
    }

    // Verificar se o reel já existe para este usuário
    const existingReel = getReelByUrl(cleanUrl, user.id);
    if (existingReel) {
      return NextResponse.json(
        { success: false, error: 'Este vídeo já foi adicionado anteriormente' },
        { status: 409 }
      );
    }

    let platform: 'instagram' | 'tiktok' | 'facebook' | 'youtube' = 'instagram';
    if (isTikTok) platform = 'tiktok';
    else if (isYouTube) platform = 'youtube';
    else if (isFacebook) platform = 'facebook';

    const videoId = extractVideoId(cleanUrl, platform);

    // O mesmo vídeo pode já estar na lista com outro formato de link (ex.: descoberto numa fonte)
    if (videoId && getReelByInstagramId(videoId, user.id)) {
      return NextResponse.json(
        { success: false, error: 'Este vídeo já está na sua lista' },
        { status: 409 }
      );
    }

    // Extrair username da URL ou usar "manual"
    let sourceUsername = 'manual';
    let sourceId = 0;

    // Verificar se existe uma source "manual" para este usuário nesta plataforma ou criar uma
    const manualSource = getSourceByUsername('manual', user.id, platform);
    if (manualSource) {
      sourceId = manualSource.id;
      sourceUsername = manualSource.username;
    } else {
      const newSource = createSource({
        username: 'manual',
        platform,
        display_name: 'Adicionados manualmente',
        user_id: user.id
      });
      sourceId = newSource.id;
      sourceUsername = newSource.username;
    }

    const reel = createReel({
      source_id: sourceId,
      source_username: sourceUsername,
      instagram_url: cleanUrl,
      instagram_id: videoId || undefined,
      caption: caption || '',
      original_caption: caption || '',
      user_id: user.id,
    });

    if (!reel) {
      return NextResponse.json(
        { success: false, error: 'Este vídeo já está na sua lista' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: true, data: { reel } },
      { status: 201 }
    );
  } catch (error) {
    console.error('❌ Erro ao criar reel:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/reels
 * Exclui um reel específico pelo ID e remove seus arquivos locais se existirem.
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'O ID do reel é obrigatório' },
        { status: 400 }
      );
    }

    const reelId = Number(id);
    const reel = getReelById(reelId, user.id);
    
    if (!reel) {
      return NextResponse.json(
        { success: false, error: 'Reel não encontrado ou não pertence a você' },
        { status: 404 }
      );
    }

    // Remover os arquivos locais associados
    if (reel.local_path && fs.existsSync(reel.local_path)) {
      try {
        fs.unlinkSync(reel.local_path);
      } catch (err) {
        console.error(`Erro ao apagar arquivo local de Reel #${reelId}:`, err);
      }
    }

    if (reel.processed_path && fs.existsSync(reel.processed_path)) {
      try {
        fs.unlinkSync(reel.processed_path);
      } catch (err) {
        console.error(`Erro ao apagar arquivo processado de Reel #${reelId}:`, err);
      }
    }

    // Deletar do banco de dados (restrito ao usuário)
    const success = deleteReel(reelId, user.id);

    if (success) {
      return NextResponse.json({ success: true, message: 'Reel excluído com sucesso' });
    } else {
      return NextResponse.json(
        { success: false, error: 'Não foi possível excluir o Reel do banco de dados' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('❌ Erro ao excluir reel:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
