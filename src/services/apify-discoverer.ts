import { ApifyClient } from 'apify-client';
import path from 'path';

/** Informações de um reel descoberto via Apify */
export interface ApifyReelInfo {
  id: string;
  url: string;
  videoUrl: string;
  caption: string;
  hashtags: string[];
  timestamp: string;
  likesCount: number;
  viewsCount: number;
  commentsCount: number;
  ownerUsername: string;
}

/** Verifica se a integração Apify está configurada */
export function isApifyConfigured(): boolean {
  return !!(process.env.APIFY_TOKEN && process.env.APIFY_TOKEN.trim() !== '');
}

/**
 * Descobre reels recentes de um perfil do Instagram usando a Apify.
 * A Apify gerencia proxies residenciais e anti-bot automaticamente.
 *
 * @param username Username do perfil Instagram
 * @param limit Número máximo de reels a descobrir
 * @returns Lista de informações de reels com URL direta do vídeo
 */
export async function discoverReelsApify(
  username: string,
  limit: number = 10
): Promise<ApifyReelInfo[]> {
  if (!isApifyConfigured()) {
    throw new Error('APIFY_TOKEN não configurado. Adicione ao arquivo .env');
  }

  console.log(`🤖 [Apify] Descobrindo reels de @${username} (limite: ${limit})...`);

  const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

  // Actor oficial principal da Apify para Instagram
  // apify/instagram-scraper é o actor mais mantido e confiável
  const actorId = process.env.APIFY_ACTOR || 'apify/instagram-scraper';

  // IMPORTANTE: o actor apify/instagram-scraper só aceita `directUrls` (URL do perfil).
  // Passar `usernames` faz o actor processar 0 requisições e retornar 0 resultados.
  const profileUrl = `https://www.instagram.com/${username.replace(/^@/, '').trim()}/`;

  try {
    const run = await client.actor(actorId).call(
      {
        directUrls: [profileUrl],
        resultsType: 'posts',
        resultsLimit: limit,
      },
      {
        // Timeout de 3 minutos para a execução do actor
        timeout: 180,
        memory: 512,
      }
    );

    if (!run || !run.defaultDatasetId) {
      console.warn('⚠️ [Apify] Nenhum dataset retornado pelo actor');
      return [];
    }

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      console.log(`🤖 [Apify] Nenhum reel encontrado para @${username}`);
      return [];
    }

    // Mapear os itens retornados pela Apify para nosso formato
    const reels: ApifyReelInfo[] = [];

    for (const item of items as Record<string, any>[]) {
      // Extrair URL do vídeo — a Apify retorna em diferentes campos dependendo do actor
      const videoUrl =
        item.videoUrl ||
        item.video_url ||
        item.displayUrl ||
        item.videoPlaybackUrl ||
        null;

      if (!videoUrl) {
        console.warn(`⚠️ [Apify] Item sem videoUrl: ${item.id || 'desconhecido'}`);
        continue;
      }

      // Extrair ID — shortcode ou id
      const reelId = item.shortCode || item.id || item.shortcode || '';
      if (!reelId) continue;

      // Filtrar apenas vídeos (reels) — ignorar fotos
      const isVideo = item.type === 'Video' || item.isVideo || item.videoUrl || item.videoPlaybackUrl;
      if (!isVideo) continue;

      // Extrair hashtags do caption
      const captionText = item.caption || item.text || '';
      const hashtagMatches = captionText.match(/#\w+/g) || [];

      reels.push({
        id: reelId,
        // Normalizar para /reel/<code>/ (a Apify retorna /p/<code>/) p/ dedup consistente
        url: `https://www.instagram.com/reel/${reelId}/`,
        videoUrl,
        caption: captionText.replace(/#\w+/g, '').trim(),
        hashtags: hashtagMatches,
        timestamp: item.timestamp || item.takenAtTimestamp || new Date().toISOString(),
        likesCount: item.likesCount || item.likeCount || 0,
        viewsCount: item.videoViewCount || item.viewsCount || 0,
        commentsCount: item.commentsCount || item.commentCount || 0,
        ownerUsername: item.ownerUsername || username,
      });
    }

    console.log(`🤖 [Apify] ${reels.length} reels com vídeo encontrados para @${username}`);
    return reels;
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes('not found') || msg.includes('does not exist')) {
      throw new Error(`Actor Apify "${actorId}" não encontrado. Verifique o nome do actor.`);
    }
    if (msg.includes('Unauthorized') || msg.includes('Invalid token')) {
      throw new Error('APIFY_TOKEN inválido. Verifique o token na sua conta Apify.');
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      throw new Error('Timeout na execução do actor Apify. O Instagram pode estar lento agora.');
    }

    throw new Error(`❌ [Apify] Erro ao descobrir reels de @${username}: ${msg}`);
  }
}

/**
 * Testa se a conexão com a Apify está funcionando.
 * @returns true se o token é válido
 */
export async function testApifyConnection(): Promise<{ ok: boolean; user?: string; error?: string }> {
  if (!isApifyConfigured()) {
    return { ok: false, error: 'APIFY_TOKEN não configurado' };
  }

  try {
    const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
    const me = await client.user('me').get();
    return { ok: true, user: me?.username || 'desconhecido' };
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Unauthorized') || msg.includes('Invalid token') || msg.includes('401')) {
      return { ok: false, error: 'Token inválido. Verifique seu APIFY_TOKEN.' };
    }
    return { ok: false, error: `Erro de conexão: ${msg}` };
  }
}

/**
 * Obtém a URL direta do vídeo de um reel específico usando a Apify.
 * Usado quando um reel foi adicionado manualmente por URL (sem passar pela descoberta de perfil).
 *
 * @param reelUrl URL do reel do Instagram (ex: https://www.instagram.com/reel/ABC123/)
 * @returns URL direta do vídeo ou null se não encontrada
 */
export async function fetchSingleReelApify(
  reelUrl: string
): Promise<ApifyReelInfo | null> {
  if (!isApifyConfigured()) {
    return null;
  }

  // Normalizar a URL — remover parâmetros de rastreamento (?igsh=...)
  let cleanUrl = reelUrl;
  try {
    const urlObj = new URL(reelUrl);
    // Manter apenas o caminho, sem query string
    cleanUrl = `${urlObj.origin}${urlObj.pathname}`.replace(/\/$/, '') + '/';
  } catch {
    // Se falhar, usa a URL original
  }

  console.log(`🤖 [Apify] Buscando URL direta para reel: ${cleanUrl}`);

  const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

  // Usar o actor principal de Instagram — aceita URLs diretas
  const actorId = process.env.APIFY_ACTOR || 'apify/instagram-scraper';

  try {
    const run = await client.actor(actorId).call(
      {
        directUrls: [cleanUrl],
        resultsType: 'posts',
        resultsLimit: 1,
      },
      {
        timeout: 120,
        memory: 256,
      }
    );

    if (!run || !run.defaultDatasetId) {
      console.warn('⚠️ [Apify] Nenhum dataset retornado para o reel individual');
      return null;
    }

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      console.warn(`⚠️ [Apify] Nenhum resultado para: ${cleanUrl}`);
      return null;
    }

    const item = items[0] as Record<string, any>;

    // Extrair URL do vídeo
    const videoUrl =
      item.videoUrl ||
      item.video_url ||
      item.videoPlaybackUrl ||
      item.displayUrl ||
      null;

    if (!videoUrl) {
      console.warn(`⚠️ [Apify] Item retornado sem videoUrl para: ${cleanUrl}`);
      return null;
    }

    const reelId = item.shortCode || item.id || item.shortcode || '';
    const captionText = item.caption || item.text || '';
    const hashtagMatches = captionText.match(/#\w+/g) || [];

    console.log(`🤖 [Apify] URL direta obtida para reel ${reelId} ✅`);

    return {
      id: reelId,
      url: item.url || cleanUrl,
      videoUrl,
      caption: captionText.replace(/#\w+/g, '').trim(),
      hashtags: hashtagMatches,
      timestamp: item.timestamp || new Date().toISOString(),
      likesCount: item.likesCount || 0,
      viewsCount: item.videoViewCount || 0,
      commentsCount: item.commentsCount || 0,
      ownerUsername: item.ownerUsername || '',
    };
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ [Apify] Falha ao buscar reel individual (${cleanUrl}): ${msg}`);
    // Retornar null para que o pipeline use o fallback (yt-dlp)
    return null;
  }
}
