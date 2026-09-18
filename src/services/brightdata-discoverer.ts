/**
 * Integração com a Bright Data (Web Scraper API — dataset de Instagram Reels).
 *
 * Fluxo da API (v3):
 *   1. POST /datasets/v3/trigger  → devolve um `snapshot_id`
 *   2. GET  /datasets/v3/progress/{snapshot_id} → status: starting | running | ready | failed
 *   3. GET  /datasets/v3/snapshot/{snapshot_id}?format=json → array de registros
 *
 * A Bright Data cuida de proxies residenciais e anti-bot automaticamente.
 */

const BRIGHTDATA_API = 'https://api.brightdata.com';

/** Dataset oficial de Instagram Reels (sobrescrevível por env) */
const DEFAULT_REELS_DATASET = 'gd_lyclm20il4r5helnj';

/** Informações de um reel descoberto via Bright Data */
export interface BrightDataReelInfo {
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

/** Token da API (Bright Data → Settings → API tokens) */
function getToken(): string | undefined {
  const token = process.env.BRIGHTDATA_API_TOKEN || process.env.BRIGHTDATA_TOKEN;
  return token && token.trim() !== '' ? token.trim() : undefined;
}

/** Dataset de reels em uso */
function getReelsDataset(): string {
  const dataset = process.env.BRIGHTDATA_REELS_DATASET;
  return dataset && dataset.trim() !== '' ? dataset.trim() : DEFAULT_REELS_DATASET;
}

/** Verifica se a integração Bright Data está configurada */
export function isBrightDataConfigured(): boolean {
  return !!getToken();
}

/** Timeout máximo (ms) de espera por um snapshot */
function getSnapshotTimeoutMs(fallback: number): number {
  const raw = Number(process.env.BRIGHTDATA_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** Erros de autenticação/HTTP traduzidos para mensagens acionáveis */
function describeHttpError(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return 'BRIGHTDATA_API_TOKEN inválido ou sem permissão. Verifique o token na sua conta Bright Data.';
  }
  if (status === 400) {
    return `Requisição rejeitada pela Bright Data (400). Verifique o dataset e a URL enviada. Detalhe: ${body.slice(0, 200)}`;
  }
  if (status === 404) {
    return `Dataset "${getReelsDataset()}" não encontrado. Confira o ID em brightdata.com/cp/scrapers.`;
  }
  return `Bright Data respondeu ${status}: ${body.slice(0, 200)}`;
}

/** Requisição autenticada à API da Bright Data */
async function brightDataFetch(
  pathAndQuery: string,
  init: RequestInit = {},
  timeoutMs = 60000
): Promise<Response> {
  const token = getToken();
  if (!token) {
    throw new Error('BRIGHTDATA_API_TOKEN não configurado. Adicione ao arquivo .env');
  }

  return fetch(`${BRIGHTDATA_API}${pathAndQuery}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Dispara uma coleta na Bright Data e devolve o snapshot_id, sem esperar o resultado.
 *
 * @param query Query string do /trigger (dataset_id, type, discover_by, ...)
 * @param input Corpo da coleta (array de entradas)
 */
async function triggerCollection(query: string, input: Record<string, unknown>[]): Promise<string> {
  const triggerRes = await brightDataFetch(`/datasets/v3/trigger?${query}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!triggerRes.ok) {
    throw new Error(describeHttpError(triggerRes.status, await triggerRes.text()));
  }

  const trigger = (await triggerRes.json()) as { snapshot_id?: string; error?: string };
  if (!trigger.snapshot_id) {
    throw new Error(`Bright Data não retornou snapshot_id${trigger.error ? `: ${trigger.error}` : ''}`);
  }

  return trigger.snapshot_id;
}

/**
 * Consulta uma coleta uma única vez.
 *
 * @returns Os registros, se o snapshot estiver pronto; null se ainda estiver em andamento
 * @throws Se a coleta falhou ou foi cancelada
 */
async function checkCollection(snapshotId: string): Promise<Record<string, any>[] | null> {
  const progressRes = await brightDataFetch(`/datasets/v3/progress/${snapshotId}`, {}, 30000);
  if (!progressRes.ok) {
    throw new Error(describeHttpError(progressRes.status, await progressRes.text()));
  }

  const progress = (await progressRes.json()) as { status?: string };

  if (progress.status === 'failed' || progress.status === 'canceled') {
    throw new Error(`Coleta da Bright Data terminou com status "${progress.status}".`);
  }
  if (progress.status !== 'ready') {
    return null;
  }

  const snapshotRes = await brightDataFetch(`/datasets/v3/snapshot/${snapshotId}?format=json`, {}, 120000);
  if (!snapshotRes.ok) {
    throw new Error(describeHttpError(snapshotRes.status, await snapshotRes.text()));
  }

  const data = await snapshotRes.json();
  return Array.isArray(data) ? (data as Record<string, any>[]) : [];
}

/**
 * Dispara uma coleta e aguarda o snapshot ficar pronto, devolvendo os registros.
 * Usado nos fluxos em que o usuário está esperando a resposta (varredura manual, reel avulso).
 *
 * @param query Query string do /trigger (dataset_id, type, discover_by, ...)
 * @param input Corpo da coleta (array de entradas)
 * @param timeoutMs Tempo máximo de espera pelo snapshot
 */
async function runCollection(
  query: string,
  input: Record<string, unknown>[],
  timeoutMs: number
): Promise<Record<string, any>[]> {
  const snapshotId = await triggerCollection(query, input);
  console.log(`🌐 [Bright Data] Coleta iniciada (snapshot ${snapshotId}), aguardando...`);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const items = await checkCollection(snapshotId);
    if (items) return items;
  }

  throw new Error(
    `Timeout aguardando a coleta da Bright Data (snapshot ${snapshotId}). O Instagram pode estar lento agora.`
  );
}

/** Normaliza hashtags vindas da Bright Data (podem vir com ou sem "#") */
function normalizeHashtags(raw: unknown, caption: string): string[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
  }
  return caption.match(/#\w+/g) || [];
}

/** Extrai o shortcode de uma URL de reel/post do Instagram */
function extractShortcode(url: string): string {
  const match = url.match(/instagram\.com\/(?:reel|reels|p|tv)\/([^/?#]+)/i);
  return match ? match[1] : '';
}

/** Converte um registro cru da Bright Data no nosso formato */
function mapReel(item: Record<string, any>, fallbackUsername: string): BrightDataReelInfo | null {
  // Com include_errors=true a Bright Data devolve itens de erro no mesmo array
  if (item.error || item.warning) {
    console.warn(`⚠️ [Bright Data] Item com erro: ${item.error || item.warning}`);
    return null;
  }

  const videoUrl = item.video_url || item.videoUrl || null;
  if (!videoUrl) {
    console.warn(`⚠️ [Bright Data] Item sem video_url: ${item.shortcode || item.post_id || 'desconhecido'}`);
    return null;
  }

  const itemUrl: string = item.url || '';
  const reelId = item.shortcode || extractShortcode(itemUrl) || item.post_id || item.content_id || '';
  if (!reelId) return null;

  const captionText: string = item.description || item.caption || '';
  const hashtags = normalizeHashtags(item.hashtags, captionText);

  return {
    id: String(reelId),
    // Normalizar para /reel/<code>/ para dedup consistente com o restante do sistema
    url: `https://www.instagram.com/reel/${reelId}/`,
    videoUrl,
    caption: captionText.replace(/#\w+/g, '').trim(),
    hashtags,
    timestamp: item.date_posted || new Date().toISOString(),
    likesCount: Number(item.likes) || 0,
    viewsCount: Number(item.views) || Number(item.video_play_count) || 0,
    commentsCount: Number(item.num_comments) || 0,
    ownerUsername: item.user_posted || fallbackUsername,
  };
}

/** Query da descoberta de reels por URL de perfil */
function discoveryQuery(): string {
  return new URLSearchParams({
    dataset_id: getReelsDataset(),
    include_errors: 'true',
    type: 'discover_new',
    discover_by: 'url',
  }).toString();
}

/** Username limpo e URL do perfil */
function profileInput(username: string, limit: number) {
  const cleanUsername = username.replace(/^@/, '').trim();
  return {
    cleanUsername,
    input: [{ url: `https://www.instagram.com/${cleanUsername}/`, num_of_posts: limit }],
  };
}

/** Converte os registros crus em reels, respeitando o limite */
function mapReels(items: Record<string, any>[], username: string, limit: number): BrightDataReelInfo[] {
  const reels: BrightDataReelInfo[] = [];
  for (const item of items) {
    const reel = mapReel(item, username);
    if (reel) reels.push(reel);
    // A Bright Data pode devolver mais itens do que o solicitado
    if (reels.length >= limit) break;
  }
  return reels;
}

/**
 * Descobre reels recentes de um perfil do Instagram usando a Bright Data,
 * aguardando o resultado (fluxo síncrono — varredura manual).
 *
 * @param username Username do perfil Instagram
 * @param limit Número máximo de reels a descobrir
 * @returns Lista de informações de reels com URL direta do vídeo
 */
export async function discoverReelsBrightData(
  username: string,
  limit: number = 10
): Promise<BrightDataReelInfo[]> {
  if (!isBrightDataConfigured()) {
    throw new Error('BRIGHTDATA_API_TOKEN não configurado. Adicione ao arquivo .env');
  }

  const { cleanUsername, input } = profileInput(username, limit);
  console.log(`🌐 [Bright Data] Descobrindo reels de @${cleanUsername} (limite: ${limit})...`);

  try {
    const items = await runCollection(discoveryQuery(), input, getSnapshotTimeoutMs(180000));
    const reels = mapReels(items, cleanUsername, limit);
    console.log(`🌐 [Bright Data] ${reels.length} reels com vídeo encontrados para @${cleanUsername}`);
    return reels;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`❌ [Bright Data] Erro ao descobrir reels de @${cleanUsername}: ${msg}`);
  }
}

/**
 * Dispara a descoberta de reels de um perfil sem esperar o resultado.
 * O resultado é recolhido depois com collectReelsDiscovery (em outro ciclo do pipeline).
 *
 * @returns snapshot_id da coleta
 */
export async function startReelsDiscovery(username: string, limit: number = 10): Promise<string> {
  if (!isBrightDataConfigured()) {
    throw new Error('BRIGHTDATA_API_TOKEN não configurado. Adicione ao arquivo .env');
  }

  const { cleanUsername, input } = profileInput(username, limit);
  const snapshotId = await triggerCollection(discoveryQuery(), input);
  console.log(`🌐 [Bright Data] Coleta de @${cleanUsername} disparada (snapshot ${snapshotId}) — resultado no próximo ciclo`);
  return snapshotId;
}

/**
 * Recolhe o resultado de uma descoberta disparada por startReelsDiscovery.
 *
 * @returns Os reels, se a coleta estiver pronta; null se ainda estiver em andamento
 * @throws Se a coleta falhou ou foi cancelada
 */
export async function collectReelsDiscovery(
  snapshotId: string,
  username: string,
  limit: number = 10
): Promise<BrightDataReelInfo[] | null> {
  const cleanUsername = username.replace(/^@/, '').trim();
  const items = await checkCollection(snapshotId);
  if (!items) return null;

  const reels = mapReels(items, cleanUsername, limit);
  console.log(`🌐 [Bright Data] ${reels.length} reels com vídeo recolhidos para @${cleanUsername} (snapshot ${snapshotId})`);
  return reels;
}

/**
 * Testa se a conexão com a Bright Data está funcionando.
 *
 * Não existe endpoint "quem sou eu" na Web Scraper API, então sondamos o
 * endpoint de progresso: token inválido responde 401, token válido responde
 * 404 (snapshot inexistente) — sem consumir crédito de coleta.
 */
export async function testBrightDataConnection(): Promise<{ ok: boolean; user?: string; error?: string }> {
  if (!isBrightDataConfigured()) {
    return { ok: false, error: 'BRIGHTDATA_API_TOKEN não configurado' };
  }

  try {
    const res = await brightDataFetch('/datasets/v3/progress/s_connection_probe', {}, 20000);

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Token inválido. Verifique seu BRIGHTDATA_API_TOKEN.' };
    }

    // 404/400 = token aceito, snapshot inexistente (esperado); 200 = improvável, mas ok
    if (res.ok || res.status === 404 || res.status === 400) {
      return { ok: true, user: `dataset ${getReelsDataset()}` };
    }

    return { ok: false, error: describeHttpError(res.status, await res.text()) };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Erro de conexão: ${msg}` };
  }
}

/**
 * Obtém a URL direta do vídeo de um reel específico usando a Bright Data.
 * Usado quando um reel foi adicionado manualmente por URL (sem passar pela descoberta de perfil).
 *
 * @param reelUrl URL do reel do Instagram (ex: https://www.instagram.com/reel/ABC123/)
 * @returns Dados do reel ou null se não encontrado (o pipeline cai no fallback yt-dlp)
 */
export async function fetchSingleReelBrightData(
  reelUrl: string
): Promise<BrightDataReelInfo | null> {
  if (!isBrightDataConfigured()) {
    return null;
  }

  // Normalizar a URL — remover parâmetros de rastreamento (?igsh=...)
  let cleanUrl = reelUrl;
  try {
    const urlObj = new URL(reelUrl);
    cleanUrl = `${urlObj.origin}${urlObj.pathname}`.replace(/\/$/, '') + '/';
  } catch {
    // Se falhar, usa a URL original
  }

  console.log(`🌐 [Bright Data] Buscando URL direta para reel: ${cleanUrl}`);

  const query = new URLSearchParams({
    dataset_id: getReelsDataset(),
    include_errors: 'true',
  }).toString();

  try {
    const items = await runCollection(query, [{ url: cleanUrl }], getSnapshotTimeoutMs(120000));

    if (items.length === 0) {
      console.warn(`⚠️ [Bright Data] Nenhum resultado para: ${cleanUrl}`);
      return null;
    }

    const reel = mapReel(items[0], '');
    if (!reel) {
      console.warn(`⚠️ [Bright Data] Item retornado sem video_url para: ${cleanUrl}`);
      return null;
    }

    console.log(`🌐 [Bright Data] URL direta obtida para reel ${reel.id} ✅`);
    return reel;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ [Bright Data] Falha ao buscar reel individual (${cleanUrl}): ${msg}`);
    // Retornar null para que o pipeline use o fallback (yt-dlp)
    return null;
  }
}
