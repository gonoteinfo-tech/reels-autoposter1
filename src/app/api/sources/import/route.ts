import { NextResponse } from 'next/server';
import {
  initDatabase,
  getSourceById,
  getReelByUrl,
  getReelByInstagramId,
  createReel,
  updateSourceLastChecked,
  getAppSettings,
  getLastPublishedAt,
} from '@/services/database';
import { getLoggedInUser } from '@/services/auth';
import { getPublishCredentials, hasPublishDestination } from '@/services/publish-credentials';
import { discoverReels, extractVideoId } from '@/services/instagram-downloader';
import { processReel } from '@/services/pipeline';
import { isBrightDataConfigured, discoverReelsBrightData } from '@/services/brightdata-discoverer';

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
    const discoveryLimit = settings.discovery_limit;

    // Sem página conectada não há onde publicar — não gastar crédito de varredura
    if (!hasPublishDestination(getPublishCredentials(user.id, settings))) {
      return NextResponse.json(
        { success: false, error: 'Conecte sua página do Facebook em Configurações antes de varrer as fontes.' },
        { status: 422 }
      );
    }

    console.log(`📥 [Importar Manual] Varrendo @${source.username} para Usuário #${user.id} (puxar até: ${discoveryLimit})...`);

    const platform = (source as any).platform || 'instagram';
    let newCount = 0;
    const newReelIds: number[] = [];

    // ── Instagram: usar Bright Data se configurado ──
    if (platform === 'instagram' && isBrightDataConfigured()) {
      console.log(`🌐 [Bright Data] Usando Bright Data para varredura manual de @${source.username}`);
      const scrapedReels = await discoverReelsBrightData(source.username, discoveryLimit);

      for (const scrapedReel of scrapedReels) {
        const url = scrapedReel.url;
        const existing = getReelByUrl(url, user.id)
          || (scrapedReel.id ? getReelByInstagramId(scrapedReel.id, user.id) : null);
        if (existing) continue;

        const newReel = createReel({
          source_id: source.id,
          source_username: source.username,
          instagram_url: url,
          instagram_id: scrapedReel.id,
          // caption vazio → IA reescreve no download; legenda da fonte vai em original_caption
          caption: '',
          original_caption: scrapedReel.caption || '',
          hashtags: scrapedReel.hashtags.join(' '),
          user_id: user.id,
          direct_video_url: scrapedReel.videoUrl, // Salvar URL direta para evitar downloads bloqueados na VPS
        });

        if (!newReel) continue; // já existia (ex.: varredura simultânea)
        newReelIds.push(newReel.id);
        newCount++;
      }
    } else if (platform === 'instagram' && !isBrightDataConfigured()) {
      // Instagram sem Bright Data cai em yt-dlp → o IP do VPS é bloqueado com HTTP 429.
      // Em vez de martelar o Instagram, devolvemos um erro acionável.
      return NextResponse.json(
        {
          success: false,
          error:
            'A descoberta do Instagram exige a integração Bright Data. Configure BRIGHTDATA_API_TOKEN no servidor para varrer perfis sem o bloqueio (HTTP 429) do Instagram em IPs de VPS.',
        },
        { status: 503 }
      );
    } else {
      // Outras plataformas (TikTok, YouTube, Facebook)
      const urls = await discoverReels(source.username, platform, discoveryLimit);

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

        if (!newReel) continue; // já existia (ex.: varredura simultânea)
        newReelIds.push(newReel.id);
        newCount++;
      }
    }

    // Atualizar data da última verificação
    updateSourceLastChecked(source.id);

    // Publicação respeita a trava de intervalo: no máximo 1 reel por janela de tempo.
    let publishingNow = false;
    if (newReelIds.length > 0) {
      const intervalMs = settings.publish_interval_minutes * 60 * 1000;
      const lastPublishedAt = getLastPublishedAt(user.id);
      const throttled =
        intervalMs > 0 &&
        !!lastPublishedAt &&
        Date.now() - new Date(lastPublishedAt).getTime() < intervalMs;

      if (settings.auto_publish && !throttled) {
        // Processa só 1 reel agora; os demais ficam na fila para os próximos ciclos do scheduler.
        publishingNow = true;
        const firstReelId = newReelIds[0];
        console.log(`📥 [Importar Manual] Publicando 1 reel (#${firstReelId}) em background; ${newReelIds.length - 1} na fila...`);
        processReel(firstReelId).catch((err) => {
          console.error(`❌ Erro em background ao processar Reel #${firstReelId}:`, err);
        });
      } else {
        console.log(
          `📥 [Importar Manual] ${newReelIds.length} reels importados e na fila — publicação aguardando ${settings.auto_publish ? 'a trava de intervalo' : 'auto_publish ser ativado'}.`
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: publishingNow
        ? `Varredura concluída. ${newCount} reels importados de @${source.username}. Publicando 1 agora; os demais entram na fila (1 a cada ${settings.publish_interval_minutes} min).`
        : `Varredura concluída. ${newCount} reels importados de @${source.username} e adicionados à fila (1 publicação a cada ${settings.publish_interval_minutes} min).`,
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
