import { NextResponse } from 'next/server';
import {
  initDatabase,
  getReelById,
  updateReel,
  updateReelStage,
  getAppSettings,
  getPublishedTotalCount,
} from '@/services/database';
import { getLoggedInUser } from '@/services/auth';
import { getPublishCredentials, hasPublishDestination } from '@/services/publish-credentials';
import { publishReel as publishToInstagram } from '@/services/instagram-publisher';
import { publishReelToPage as publishToFacebook } from '@/services/facebook-publisher';
import { buildCaption } from '@/services/pipeline';
import type { ApiResponse } from '@/types';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * POST /api/publish
 * Publica um reel específico no Instagram e/ou Facebook do usuário logado.
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
    const { reelId, targets } = body as {
      reelId?: number;
      targets?: ('instagram' | 'facebook')[];
    };

    // Validações
    if (!reelId || typeof reelId !== 'number') {
      return NextResponse.json(
        { success: false, error: 'O campo "reelId" é obrigatório e deve ser um número' },
        { status: 400 }
      );
    }

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json(
        { success: false, error: 'O campo "targets" é obrigatório e deve conter pelo menos um destino' },
        { status: 400 }
      );
    }

    const validTargets = ['instagram', 'facebook'];
    for (const target of targets) {
      if (!validTargets.includes(target)) {
        return NextResponse.json(
          { success: false, error: `Target inválido: "${target}". Use "instagram" ou "facebook"` },
          { status: 400 }
        );
      }
    }

    // Buscar o reel (restrito ao usuário)
    const reel = getReelById(reelId, user.id);
    if (!reel) {
      return NextResponse.json(
        { success: false, error: `Reel com ID ${reelId} não encontrado ou não pertence a você` },
        { status: 404 }
      );
    }

    // Verificar limite do plano gratuito (máximo 1 publicação)
    if (user.plan === 'free') {
      const publishedCount = getPublishedTotalCount(user.id);
      if (publishedCount >= 1) {
        return NextResponse.json(
          {
            success: false,
            error: 'Limite do plano gratuito atingido (máximo 1 publicação). Por favor, atualize seu plano.',
          },
          { status: 403 }
        );
      }
    }

    // Verificar se o reel tem URL pública (foi feito upload para R2)
    if (!reel.r2_url) {
      return NextResponse.json(
        {
          success: false,
          error: 'O reel ainda não possui uma URL pública. Execute o pipeline de upload primeiro',
        },
        { status: 422 }
      );
    }

    // Carregar configurações e credenciais do usuário (só a página que ELE conectou)
    const settings = getAppSettings(user.id);
    const credentials = getPublishCredentials(user.id, settings);
    if (!hasPublishDestination(credentials)) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma página do Facebook conectada. Conecte em Configurações → Facebook.' },
        { status: 422 }
      );
    }

    // Atualizar estágio para "publishing"
    updateReelStage(reelId, 'publishing');

    const result: { igPostId?: string; fbPostId?: string } = {};
    const updateData: Record<string, unknown> = {};

    const finalCaption = buildCaption(
      reel.caption || reel.original_caption,
      reel.hashtags,
      settings.custom_caption_template
    );

    // Publicar no Instagram (usando credenciais do usuário)
    if (targets.includes('instagram')) {
      try {
        const { mediaId } = await publishToInstagram(
          reel.r2_url,
          finalCaption,
          credentials.pageToken,
          credentials.igAccountId
        );
        result.igPostId = mediaId;
        updateData.ig_post_id = mediaId;
        console.log(`✅ Reel #${reelId} publicado no Instagram: ${mediaId}`);
      } catch (igError) {
        console.error(`❌ Erro ao publicar no Instagram:`, igError);
        if (!targets.includes('facebook')) {
          updateReelStage(reelId, 'error', igError instanceof Error ? igError.message : 'Erro no Instagram');
          return NextResponse.json(
            { success: false, error: igError instanceof Error ? igError.message : 'Erro ao publicar no Instagram' },
            { status: 500 }
          );
        }
      }
    }

    // Publicar no Facebook (usando credenciais do usuário)
    if (targets.includes('facebook')) {
      try {
        const fbPostId = await publishToFacebook(
          reel.r2_url,
          finalCaption,
          credentials.pageToken,
          credentials.pageId
        );
        result.fbPostId = fbPostId;
        updateData.fb_post_id = fbPostId;
        console.log(`✅ Reel #${reelId} publicado no Facebook: ${fbPostId}`);
      } catch (fbError) {
        console.error(`❌ Erro ao publicar no Facebook:`, fbError);
        if (!result.igPostId) {
          updateReelStage(reelId, 'error', fbError instanceof Error ? fbError.message : 'Erro no Facebook');
          return NextResponse.json(
            { success: false, error: fbError instanceof Error ? fbError.message : 'Erro ao publicar no Facebook' },
            { status: 500 }
          );
        }
      }
    }

    // Atualizar reel com os IDs de publicação
    if (result.igPostId || result.fbPostId) {
      updateReel(reelId, {
        ...updateData,
        stage: 'published',
        published_at: new Date().toISOString(),
      }, user.id);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('❌ Erro ao publicar reel:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
