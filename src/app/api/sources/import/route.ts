import { NextResponse } from 'next/server';
import {
  initDatabase,
  getSourceById,
  getReelByUrl,
  createReel,
  updateSourceLastChecked,
  getAppSettings,
} from '@/services/database';
import { getLoggedInUser } from '@/services/auth';
import { discoverReels, extractVideoId } from '@/services/instagram-downloader';
import { processReel } from '@/services/pipeline';
import { isApifyConfigured, discoverReelsApify } from '@/services/apify-discoverer';

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * POST /api/sources/import
 * Varre e importa manualmente novos reels de um perfil-fonte específico do usuário.
 * Dispara o processamento em background para os novos itens.
 */
export async function POST(request: Request) {
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
    const { sourceId } = body as { sourceId?: number };

    if (!sourceId) {
      return NextResponse.json(
        { success: false, error: 'O ID do perfil-fonte (sourceId) é obrigatório' },
        { status: 400 }
      );
    }

    // Buscar a fonte garantindo o escopo do usuário
    const source = getSourceById(Number(sourceId), user.id);
    if (!source) {
      return NextResponse.json(
        { success: false, error: 'Perfil-fonte não encontrado ou não pertence a você' },
        { status: 404 }
      );
    }

    if (source.username === 'manual') {
      return NextResponse.json(
        { success: false, error: 'Não é possível varrer a fonte manual' },
        { status: 400 }
      );
    }

    const settings = getAppSettings(user.id);
    const maxReels = settings.max_reels_per_run;

    console.log(`📥 [Importar Manual] Varrendo @${source.username} para Usuário #${user.id} (limite: ${maxReels})...`);

    const platform = (source as any).platform || 'instagram';
    let newCount = 0;
    const newReelIds: number[] = [];

    // ── Instagram: usar Apify se configurado ──
    if (platform === 'instagram' && isApifyConfigured()) {
      console.log(`🤖 [Apify] Usando Apify para varredura manual de @${source.username}`);
      const apifyReels = await discoverReelsApify(source.username, maxReels);

      for (const apifyReel of apifyReels) {
        const url = apifyReel.url;
        const existing = getReelByUrl(url, user.id);
        if (existing) continue;

        const newReel = createReel({
          source_id: source.id,
          source_username: source.username,
          instagram_url: url,
          instagram_id: apifyReel.id,
          caption: apifyReel.caption || '',
          hashtags: apifyReel.hashtags.join(' '),
          user_id: user.id,
          direct_video_url: apifyReel.videoUrl, // Salvar URL direta para evitar downloads bloqueados na VPS
        });

        newReelIds.push(newReel.id);
        newCount++;
      }
    } else {
      // Outras plataformas ou Instagram sem Apify (fallback yt-dlp)
      const urls = await discoverReels(source.username, platform, maxReels);

      for (const url of urls) {
        const existing = getReelByUrl(url, user.id);
        if (existing) continue;

        const videoId = extractVideoId(url, platform);
        const newReel = createReel({
          source_id: source.id,
          source_username: source.username,
          instagram_url: url,
          instagram_id: videoId || undefined,
          user_id: user.id,
        });

        newReelIds.push(newReel.id);
        newCount++;
      }
    }

    // Atualizar data da última verificação
    updateSourceLastChecked(source.id);

    // Se existirem novos Reels, disparar o pipeline em background
    if (newReelIds.length > 0) {
      console.log(`📥 [Importar Manual] Disparando pipeline em background para ${newReelIds.length} novos reels...`);
      for (const reelId of newReelIds) {
        processReel(reelId).catch((err) => {
          console.error(`❌ Erro em background ao processar Reel #${reelId}:`, err);
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Varredura concluída. ${newCount} novos reels foram importados de @${source.username}.`,
      data: {
        newReelsCount: newCount,
      }
    });
  } catch (error) {
    console.error('❌ Erro no endpoint de importação manual:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
