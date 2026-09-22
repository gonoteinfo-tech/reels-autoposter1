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
  setSourcePendingSnapshot,
} from '@/services/database';
import { getLoggedInUser } from '@/services/auth';
import { getPublishCredentials, hasPublishDestination } from '@/services/publish-credentials';
import { discoverReels, extractVideoId } from '@/services/instagram-downloader';
import { collectPendingDiscovery, processReel } from '@/services/pipeline';
import { isBrightDataConfigured, startReelsDiscovery } from '@/services/brightdata-discoverer';
import type { AppSettings, SourceProfile } from '@/types';

/** Intervalo entre consultas à coleta da Bright Data enquanto a sincronização roda em segundo plano */
const POLL_INTERVAL_MS = 10_000;
/** Depois disso a sincronização manual para de acompanhar; o ciclo automático recolhe o resultado */
const POLL_MAX_MS = 10 * 60_000;

/** Garante que o banco está inicializado */
function ensureDb() {
  initDatabase();
}

/**
 * Publica 1 reel novo agora, se a publicação automática estiver ligada e a trava de
 * intervalo permitir. Os demais ficam na fila para os próximos ciclos.
 */
function publishFirstIfAllowed(newReelIds: number[], userId: number, settings: AppSettings): void {
  if (newReelIds.length === 0) return;

  const intervalMs = settings.publish_interval_minutes * 60 * 1000;
  const lastPublishedAt = getLastPublishedAt(userId);
  const throttled =
    intervalMs > 0 &&
    !!lastPublishedAt &&
    Date.now() - new Date(lastPublishedAt).getTime() < intervalMs;

  if (settings.auto_publish && !throttled) {
    const firstReelId = newReelIds[0];
    console.log(`📥 [Sincronizar] Publicando 1 reel (#${firstReelId}); ${newReelIds.length - 1} na fila...`);
    processReel(firstReelId).catch((err) => {
      console.error(`❌ Erro em background ao processar Reel #${firstReelId}:`, err);
    });
  } else {
    console.log(
      `📥 [Sincronizar] ${newReelIds.length} reels na fila — publicação aguardando ${settings.auto_publish ? 'a trava de intervalo' : 'a publicação automática ser ligada'}.`
    );
  }
}

/**
 * Acompanha em segundo plano a coleta da Bright Data de um perfil-fonte até ela ficar pronta,
 * cria os reels novos e publica 1, se permitido.
 */
async function followBrightDataSync(sourceId: number, userId: number, settings: AppSettings): Promise<void> {
  const deadline = Date.now() + POLL_MAX_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const source = getSourceById(sourceId, userId);
    // Sem coleta pendente: já foi recolhida por outro processo (ciclo automático) ou descartada
    if (!source?.pending_snapshot_id) return;

    const result = await collectPendingDiscovery(source, userId, settings.discovery_limit);
    if (result.status === 'pending') continue;
    if (result.status === 'done') publishFirstIfAllowed(result.newReelIds, userId, settings);
    return;
  }

  console.log(`🌐 [Sincronizar] Coleta da fonte #${sourceId} ainda em andamento — o ciclo automático recolhe o resultado.`);
}

/** Varredura de TikTok, YouTube e Facebook (yt-dlp) em segundo plano */
async function syncOtherPlatform(
  source: SourceProfile,
  platform: NonNullable<SourceProfile['platform']>,
  userId: number,
  settings: AppSettings
): Promise<void> {
  const urls = await discoverReels(source.username, platform, settings.discovery_limit);
  const newReelIds: number[] = [];

  for (const url of urls) {
    if (getReelByUrl(url, userId)) continue;

    const videoId = extractVideoId(url, platform);
    if (videoId && getReelByInstagramId(videoId, userId)) continue;

    const newReel = createReel({
      source_id: source.id,
      source_username: source.username,
      instagram_url: url,
      instagram_id: videoId || undefined,
      user_id: userId,
    });
    if (newReel) newReelIds.push(newReel.id); // null = já existia (varredura simultânea)
  }

  updateSourceLastChecked(source.id);
  console.log(`📥 [Sincronizar] @${source.username} (${platform}): ${newReelIds.length} novos reels`);
  publishFirstIfAllowed(newReelIds, userId, settings);
}

/**
 * POST /api/sources/import
 * Sincroniza manualmente um perfil-fonte do usuário.
 *
 * Responde na hora e faz a varredura em segundo plano: a coleta da Bright Data leva de 1 a
 * 3 minutos, e esperar por ela na requisição estourava o tempo limite do proxy (nginx),
 * o que aparecia na tela como "Erro de conexão com o servidor".
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

    // Sem página conectada não há onde publicar — não gastar crédito de varredura
    if (!hasPublishDestination(getPublishCredentials(user.id, settings))) {
      return NextResponse.json(
        { success: false, error: 'Conecte sua página do Facebook em Configurações antes de varrer as fontes.' },
        { status: 422 }
      );
    }

    const platform = source.platform || 'instagram';
    const startedMessage = `Sincronização de @${source.username} iniciada. Os vídeos novos aparecem na lista em 1 a 3 minutos.`;

    // ── Instagram: coleta assíncrona na Bright Data ──
    if (platform === 'instagram') {
      if (!isBrightDataConfigured()) {
        // Sem Bright Data cairia no yt-dlp → o IP da VPS é bloqueado com HTTP 429
        return NextResponse.json(
          {
            success: false,
            error:
              'A descoberta do Instagram exige a integração Bright Data. Configure BRIGHTDATA_API_TOKEN no servidor para varrer perfis sem o bloqueio (HTTP 429) do Instagram em IPs de VPS.',
          },
          { status: 503 }
        );
      }

      // Já existe coleta disparada (clique duplo, ou pelo ciclo automático): acompanhar em vez de pagar outra
      if (source.pending_snapshot_id) {
        const result = await collectPendingDiscovery(source, user.id, settings.discovery_limit);

        if (result.status === 'pending') {
          followBrightDataSync(source.id, user.id, settings).catch((err) =>
            console.error(`❌ [Sincronizar] Erro acompanhando @${source.username}:`, err)
          );
          return NextResponse.json({
            success: true,
            message: `A sincronização de @${source.username} já está em andamento. Os vídeos novos aparecem na lista em instantes.`,
            data: { pending: true, newReelsCount: 0 },
          });
        }

        if (result.status === 'done') {
          publishFirstIfAllowed(result.newReelIds, user.id, settings);
          return NextResponse.json({
            success: true,
            message: `Sincronização concluída: ${result.newReelIds.length} vídeos novos de @${source.username}.`,
            data: { pending: false, newReelsCount: result.newReelIds.length },
          });
        }
        // 'discarded': coleta velha ou com falha — segue para disparar uma nova
      }

      console.log(`📥 [Sincronizar] Disparando coleta de @${source.username} para Usuário #${user.id} (até ${settings.discovery_limit})...`);
      const snapshotId = await startReelsDiscovery(source.username, settings.discovery_limit);
      setSourcePendingSnapshot(source.id, snapshotId);

      followBrightDataSync(source.id, user.id, settings).catch((err) =>
        console.error(`❌ [Sincronizar] Erro acompanhando @${source.username}:`, err)
      );

      return NextResponse.json({
        success: true,
        message: startedMessage,
        data: { pending: true, newReelsCount: 0 },
      });
    }

    // ── Outras plataformas (TikTok, YouTube, Facebook): varredura em segundo plano ──
    syncOtherPlatform(source, platform, user.id, settings).catch((err) =>
      console.error(`❌ [Sincronizar] Erro na varredura de @${source.username} (${platform}):`, err)
    );

    return NextResponse.json({
      success: true,
      message: startedMessage,
      data: { pending: true, newReelsCount: 0 },
    });
  } catch (error) {
    console.error('❌ Erro no endpoint de sincronização manual:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
