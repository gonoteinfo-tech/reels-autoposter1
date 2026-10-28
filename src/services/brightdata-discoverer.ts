import { safeError } from "./jobs";

type BrightDataRecord = Record<string, unknown> & {
  error?: string;
  error_code?: string;
  warning?: string;
  video_url?: string;
  videoUrl?: string;
  shortcode?: string;
  post_id?: string;
  content_id?: string;
  url?: string;
  description?: string;
  caption?: string;
  date_posted?: string;
  user_posted?: string;
};

/** The snapshot is complete; reading it again cannot repair its result. */
export class BrightDataSnapshotError extends Error {
  readonly code: string;
  constructor(detail: string) {
    const limited = /too many requests|rate.?limit|\b429\b/i.test(detail);
    super(limited
      ? `A Bright Data atingiu um limite de solicitações no site de origem. Aguarde e tente Sincronizar novamente. Detalhe: ${safeError(detail)}`
      : `A coleta da Bright Data terminou sem um resultado válido. Confira o scraper antes de sincronizar novamente. Detalhe: ${safeError(detail)}`);
    this.code = limited ? "scraper_rate_limited" : "scraper_result";
  }
}
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

/** API da Bright Data (sobrescrevível para testes locais com um servidor simulado) */
const BRIGHTDATA_API =
  process.env.BRIGHTDATA_API_URL || "https://api.brightdata.com";

/** Dataset oficial de Instagram Reels (sobrescrevível por env) */
const DEFAULT_REELS_DATASET = "gd_lyclm20il4r5helnj";

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
  const token =
    process.env.BRIGHTDATA_API_TOKEN || process.env.BRIGHTDATA_TOKEN;
  return token && token.trim() !== "" ? token.trim() : undefined;
}

/** Dataset de reels em uso */
function getReelsDataset(): string {
  const dataset = process.env.BRIGHTDATA_REELS_DATASET;
  return dataset && dataset.trim() !== ""
    ? dataset.trim()
    : DEFAULT_REELS_DATASET;
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
    return "BRIGHTDATA_API_TOKEN inválido ou sem permissão. Verifique o token na sua conta Bright Data.";
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
  timeoutMs = 60000,
): Promise<Response> {
  const token = getToken();
  if (!token) {
    throw new Error(
      "BRIGHTDATA_API_TOKEN não configurado. Adicione ao arquivo .env",
    );
  }

  return fetch(`${BRIGHTDATA_API}${pathAndQuery}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
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
async function triggerCollection(
  query: string,
  input: Record<string, unknown>[],
): Promise<string> {
  const triggerRes = await brightDataFetch(`/datasets/v3/trigger?${query}`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  if (!triggerRes.ok) {
    throw new Error(
      describeHttpError(triggerRes.status, await triggerRes.text()),
    );
  }

  const trigger = (await triggerRes.json()) as {
    snapshot_id?: string;
    error?: string;
  };
  if (!trigger.snapshot_id) {
    throw new Error(
      `Bright Data não retornou snapshot_id${trigger.error ? `: ${trigger.error}` : ""}`,
    );
  }

  return trigger.snapshot_id;
}

/**
 * Consulta uma coleta uma única vez.
 *
 * @returns Os registros, se o snapshot estiver pronto; null se ainda estiver em andamento
 * @throws Se a coleta falhou ou foi cancelada
 */
async function checkCollection(
  snapshotId: string,
): Promise<BrightDataRecord[] | null> {
  const progressRes = await brightDataFetch(
    `/datasets/v3/progress/${snapshotId}`,
    {},
    30000,
  );
  if (!progressRes.ok) {
    throw new Error(
      describeHttpError(progressRes.status, await progressRes.text()),
    );
  }

  const progress = (await progressRes.json()) as { status?: string };

  if (progress.status === "failed" || progress.status === "canceled") {
    throw new BrightDataSnapshotError(
      `Coleta da Bright Data terminou com status "${progress.status}".`,
    );
  }
  if (progress.status !== "ready") {
    return null;
  }

  const snapshotRes = await brightDataFetch(
    `/datasets/v3/snapshot/${snapshotId}?format=json`,
    {},
    120000,
  );
  if (!snapshotRes.ok) {
    throw new Error(
      describeHttpError(snapshotRes.status, await snapshotRes.text()),
    );
  }

  const data = await snapshotRes.json();
  if (!Array.isArray(data) || data.some(item => !item || typeof item !== "object" || Array.isArray(item)))
    throw new BrightDataSnapshotError("Formato de snapshot inválido: esperado um array de registros.");
  return data as BrightDataRecord[];
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
  timeoutMs: number,
): Promise<BrightDataRecord[]> {
  const snapshotId = await triggerCollection(query, input);
  console.log(
    `🌐 [Bright Data] Coleta iniciada (snapshot ${snapshotId}), aguardando...`,
  );

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const items = await checkCollection(snapshotId);
    if (items) return items;
  }

  throw new Error(
    `Timeout aguardando a coleta da Bright Data (snapshot ${snapshotId}). O Instagram pode estar lento agora.`,
  );
}

/** Normaliza hashtags vindas da Bright Data (podem vir com ou sem "#") */
function normalizeHashtags(raw: unknown, caption: string): string[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  }
  return caption.match(/#\w+/g) || [];
}

/** Extrai o shortcode de uma URL de reel/post do Instagram */
function extractShortcode(url: string): string {
  const match = url.match(/instagram\.com\/(?:reel|reels|p|tv)\/([^/?#]+)/i);
  return match ? match[1] : "";
}

/** Converte um registro cru da Bright Data no nosso formato */
function mapReel(
  item: BrightDataRecord,
  fallbackUsername: string,
): BrightDataReelInfo | null {
  // Com include_errors=true a Bright Data devolve itens de erro no mesmo array
  if (item.error || item.warning || item.error_code) {
    console.warn(
      `⚠️ [Bright Data] Item com erro: ${safeError(item.error || item.warning || item.error_code)}`,
    );
    return null;
  }

  const videoUrl = item.video_url || item.videoUrl || null;
  if (!videoUrl) {
    console.warn(
      `⚠️ [Bright Data] Item sem video_url: ${item.shortcode || item.post_id || "desconhecido"}`,
    );
    return null;
  }

  const itemUrl: string = item.url || "";
  const reelId =
    item.shortcode ||
    extractShortcode(itemUrl) ||
    item.post_id ||
    item.content_id ||
    "";
  if (!reelId) return null;

  const captionText: string = item.description || item.caption || "";
  const hashtags = normalizeHashtags(item.hashtags, captionText);

  return {
    id: String(reelId),
    // Normalizar para /reel/<code>/ para dedup consistente com o restante do sistema
    url: `https://www.instagram.com/reel/${reelId}/`,
    videoUrl,
    caption: captionText.replace(/#\w+/g, "").trim(),
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
    include_errors: "true",
    type: "discover_new",
    discover_by: "url_all_reels",
  }).toString();
}

/** Username limpo e URL do perfil */
function profileInput(username: string, limit: number) {
  const cleanUsername = username.replace(/^@/, "").trim();
  return {
    cleanUsername,
    input: [
      {
        url: `https://www.instagram.com/${cleanUsername}/`,
        num_of_posts: limit,
      },
    ],
  };
}

/** Converte os registros crus em reels, respeitando o limite */
function mapReels(
  items: BrightDataRecord[],
  username: string,
  limit: number,
): BrightDataReelInfo[] {
  const reels: BrightDataReelInfo[] = [];
  for (const item of items) {
    const reel = mapReel(item, username);
    if (reel) reels.push(reel);
    // A Bright Data pode devolver mais itens do que o solicitado
    if (reels.length >= limit) break;
  }
  if (items.length && !reels.length) {
    const failed = items.find(item => item.error || item.warning || item.error_code);
    throw new BrightDataSnapshotError(failed
      ? String(failed.error || failed.warning || failed.error_code)
      : "O snapshot contém registros, mas nenhum vídeo com identificador e URL de download válidos.");
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
  limit: number = 10,
): Promise<BrightDataReelInfo[]> {
  if (!isBrightDataConfigured()) {
    throw new Error(
      "BRIGHTDATA_API_TOKEN não configurado. Adicione ao arquivo .env",
    );
  }

  const { cleanUsername, input } = profileInput(username, limit);
  console.log(
    `🌐 [Bright Data] Descobrindo reels de @${cleanUsername} (limite: ${limit})...`,
  );

  try {
    const items = await runCollection(
      discoveryQuery(),
      input,
      getSnapshotTimeoutMs(180000),
    );
    const reels = mapReels(items, cleanUsername, limit);
    console.log(
      `🌐 [Bright Data] ${reels.length} reels com vídeo encontrados para @${cleanUsername}`,
    );
    return reels;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `❌ [Bright Data] Erro ao descobrir reels de @${cleanUsername}: ${msg}`,
    );
  }
}

/**
 * Dispara a descoberta de reels de um perfil sem esperar o resultado.
 * O resultado é recolhido depois com collectReelsDiscovery (em outro ciclo do pipeline).
 *
 * @returns snapshot_id da coleta
 */
export async function startReelsDiscovery(
  username: string,
  limit: number = 10,
): Promise<string> {
  if (!isBrightDataConfigured()) {
    throw new Error(
      "BRIGHTDATA_API_TOKEN não configurado. Adicione ao arquivo .env",
    );
  }

  const { cleanUsername, input } = profileInput(username, limit);
  const snapshotId = await triggerCollection(discoveryQuery(), input);
  console.log(
    `🌐 [Bright Data] Coleta de @${cleanUsername} disparada (snapshot ${snapshotId}) — resultado no próximo ciclo`,
  );
  return snapshotId;
}

export async function startProfileDiscovery(
  username: string,
  platform: "instagram" | "facebook",
  limit: number,
): Promise<string> {
  if (platform === "instagram") return startReelsDiscovery(username, limit);
  const clean = username.replace(/^@/, "").trim();
  if (!/^[\w.-]+$/.test(clean)) throw new Error("Perfil Facebook inválido.");
  const query = new URLSearchParams({
    dataset_id:
      process.env.BRIGHTDATA_FACEBOOK_REELS_DATASET || "gd_lyclm3ey2q6rww027t",
    include_errors: "true",
  });
  return triggerCollection(query.toString(), [
    { url: `https://www.facebook.com/${clean}`, num_of_posts: limit },
  ]);
}

export async function startSingleReelDiscovery(url: string): Promise<string> {
  const parsed = new URL(url);
  if (
    !["instagram.com", "www.instagram.com"].includes(parsed.hostname) ||
    !/^\/(reel|reels|p)\/[\w-]+\/?$/.test(parsed.pathname)
  )
    throw new Error("URL Instagram inválida.");
  const query = new URLSearchParams({
    dataset_id: getReelsDataset(),
    include_errors: "true",
  });
  return triggerCollection(query.toString(), [
    { url: parsed.origin + parsed.pathname },
  ]);
}

export async function collectProfileDiscovery(
  snapshotId: string,
  username: string,
  platform: "instagram" | "facebook",
  limit: number,
): Promise<BrightDataReelInfo[] | null> {
  if (platform === "instagram")
    return collectReelsDiscovery(snapshotId, username, limit);
  const items = await checkCollection(snapshotId);
  if (!items) return null;
  const reels: BrightDataReelInfo[] = [];
  for (const item of items) {
    if (item.error || item.warning || item.error_code)
      throw new BrightDataSnapshotError(String(item.error || item.warning || item.error_code));
    const id = String(
      item.shortcode ||
        String(item.url || "").match(/\/reel\/(\d+)/)?.[1] ||
        item.post_id ||
        "",
    );
    if (!id || !item.video_url) continue;
    const caption = String(item.content || item.description || "");
    reels.push({
      id,
      url: `https://www.facebook.com/reel/${id}/`,
      videoUrl: String(item.video_url),
      caption,
      hashtags: normalizeHashtags(item.hashtags, caption),
      timestamp: String(item.date_posted || ""),
      likesCount: Number(item.likes) || 0,
      viewsCount: Number(item.video_view_count) || 0,
      commentsCount: Number(item.num_comments) || 0,
      ownerUsername: username,
    });
    if (reels.length >= limit) break;
  }
  if (items.length && !reels.length)
    throw new BrightDataSnapshotError(
      "Coleta sem vídeos válidos; confira o contrato do dataset.",
    );
  return reels;
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
  limit: number = 10,
): Promise<BrightDataReelInfo[] | null> {
  const cleanUsername = username.replace(/^@/, "").trim();
  const items = await checkCollection(snapshotId);
  if (!items) return null;

  const reels = mapReels(items, cleanUsername, limit);
  console.log(
    `🌐 [Bright Data] ${reels.length} reels com vídeo recolhidos para @${cleanUsername} (snapshot ${snapshotId})`,
  );
  return reels;
}

/**
 * Testa se a conexão com a Bright Data está funcionando.
 *
 * Não existe endpoint "quem sou eu" na Web Scraper API, então sondamos o
 * endpoint de progresso: token inválido responde 401, token válido responde
 * 404 (snapshot inexistente) — sem consumir crédito de coleta.
 */
export async function testBrightDataConnection(): Promise<{
  ok: boolean;
  user?: string;
  error?: string;
}> {
  if (!isBrightDataConfigured()) {
    return { ok: false, error: "BRIGHTDATA_API_TOKEN não configurado" };
  }

  try {
    const res = await brightDataFetch(
      "/datasets/v3/progress/s_connection_probe",
      {},
      20000,
    );

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "Token inválido. Verifique seu BRIGHTDATA_API_TOKEN.",
      };
    }

    // 404/400 = token aceito, snapshot inexistente (esperado); 200 = improvável, mas ok
    if (res.ok || res.status === 404 || res.status === 400) {
      return { ok: true, user: `dataset ${getReelsDataset()}` };
    }

    return {
      ok: false,
      error: describeHttpError(res.status, await res.text()),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Erro de conexão: ${msg}` };
  }
}

/**
 * Traduz o erro que a Bright Data devolve para um post num motivo acionável.
 * "Post isn't available" costuma ser post com restrição (conteúdo sensível ou de idade),
 * privado ou removido — o Instagram só mostra esses posts para usuários logados.
 */
function describePostError(error: string): string {
  if (/isn.?t available|not available|unavailable/i.test(error)) {
    return `post indisponível sem login ("${error}") — provavelmente conteúdo sensível/restrito por idade, conta privada ou post removido`;
  }
  return error;
}

/**
 * Obtém a URL direta do vídeo de um reel específico usando a Bright Data.
 * Usado quando o reel não tem URL direta (adicionado manualmente) ou quando ela expirou.
 *
 * @param reelUrl URL do reel do Instagram (ex: https://www.instagram.com/reel/ABC123/)
 * @returns Dados do reel com a URL direta do vídeo
 * @throws Com o motivo, se a Bright Data não estiver configurada ou não devolver o vídeo
 */
export async function fetchSingleReelBrightData(
  reelUrl: string,
): Promise<BrightDataReelInfo> {
  if (!isBrightDataConfigured()) {
    throw new Error("BRIGHTDATA_API_TOKEN não configurado");
  }

  // Normalizar a URL — remover parâmetros de rastreamento (?igsh=...)
  let cleanUrl = reelUrl;
  try {
    const urlObj = new URL(reelUrl);
    cleanUrl = `${urlObj.origin}${urlObj.pathname}`.replace(/\/$/, "") + "/";
  } catch {
    // Se falhar, usa a URL original
  }

  console.log(`🌐 [Bright Data] Buscando URL direta para reel: ${cleanUrl}`);

  const query = new URLSearchParams({
    dataset_id: getReelsDataset(),
    include_errors: "true",
  }).toString();

  const items = await runCollection(
    query,
    [{ url: cleanUrl }],
    getSnapshotTimeoutMs(180000),
  );

  if (items.length === 0) {
    throw new Error("a Bright Data não devolveu nenhum resultado");
  }

  const first = items[0];
  if (first.error || first.warning) {
    throw new Error(describePostError(String(first.error || first.warning)));
  }

  const reel = mapReel(first, "");
  if (!reel) {
    throw new Error(
      "a Bright Data devolveu o post sem video_url (pode não ser um vídeo)",
    );
  }

  console.log(`🌐 [Bright Data] URL direta obtida para reel ${reel.id} ✅`);
  return reel;
}
