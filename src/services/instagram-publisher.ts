import axios, { AxiosError } from 'axios';

const BASE_URL = 'https://graph.facebook.com/v21.0';

/** Intervalo entre verificações de status do container (ms) */
const POLL_INTERVAL_MS = 5000;

/** Número máximo de tentativas de polling */
const MAX_POLL_RETRIES = 60;

/**
 * Utilitário para aguardar N milissegundos.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cria um container de Reel no Instagram Graph API.
 *
 * @param videoUrl URL pública do vídeo
 * @param caption Legenda do reel
 * @param accessToken Token de acesso (opcional)
 * @param accountId ID da conta business do Instagram (opcional)
 * @returns ID do container criado
 */
export async function createReelContainer(
  videoUrl: string,
  caption: string,
  accessToken?: string,
  accountId?: string
): Promise<string> {
  console.log('📱 Criando container de Reel no Instagram...');

  const token = accessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const igAccountId = accountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!token) {
    throw new Error('❌ Token do Facebook não fornecido e FACEBOOK_PAGE_ACCESS_TOKEN não configurado.');
  }
  if (!igAccountId) {
    throw new Error('❌ ID da conta Instagram não fornecido e INSTAGRAM_BUSINESS_ACCOUNT_ID não configurado.');
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/${igAccountId}/media`,
      null,
      {
        params: {
          media_type: 'REELS',
          video_url: videoUrl,
          caption: caption,
          share_to_feed: 'true',
          access_token: token,
        },
        timeout: 30000,
      }
    );

    const containerId = response.data.id;
    console.log(`📱 Container criado: ${containerId}`);
    return containerId;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    throw new Error(`❌ Falha ao criar container de Reel: ${errorMsg}`);
  }
}

/**
 * Verifica o status de processamento de um container de Reel.
 *
 * @param containerId ID do container para verificar
 * @param accessToken Token de acesso (opcional)
 * @returns Status atual e mensagem de erro (se houver)
 */
export async function checkContainerStatus(
  containerId: string,
  accessToken?: string
): Promise<{ status: string; error?: string }> {
  const token = accessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  if (!token) {
    throw new Error('❌ Token do Facebook não fornecido.');
  }

  try {
    const response = await axios.get(`${BASE_URL}/${containerId}`, {
      params: {
        fields: 'status_code,status',
        access_token: token,
      },
      timeout: 15000,
    });

    const statusCode = response.data.status_code;
    const status = response.data.status;

    console.log(`📱 Status do container ${containerId}: ${statusCode}`);

    return {
      status: statusCode,
      error: statusCode === 'ERROR' ? (status || 'Erro desconhecido') : undefined,
    };
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    throw new Error(`❌ Falha ao verificar status do container: ${errorMsg}`);
  }
}

/**
 * Publica um container de Reel que já está com status FINISHED.
 *
 * @param containerId ID do container pronto para publicação
 * @param accessToken Token de acesso (opcional)
 * @param accountId ID da conta business do Instagram (opcional)
 * @returns ID da mídia publicada
 */
export async function publishContainer(
  containerId: string,
  accessToken?: string,
  accountId?: string
): Promise<string> {
  console.log(`📱 Publicando container ${containerId}...`);

  const token = accessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const igAccountId = accountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!token) {
    throw new Error('❌ Token do Facebook não fornecido.');
  }
  if (!igAccountId) {
    throw new Error('❌ ID da conta Instagram não fornecido.');
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/${igAccountId}/media_publish`,
      null,
      {
        params: {
          creation_id: containerId,
          access_token: token,
        },
        timeout: 30000,
      }
    );

    const mediaId = response.data.id;
    console.log(`📱 Reel publicado no Instagram! Media ID: ${mediaId}`);
    return mediaId;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);

    // Tratar erro específico 9007: publicação enquanto container ainda está IN_PROGRESS
    if (errorMsg.includes('9007') || errorMsg.includes('in progress')) {
      throw new Error(
        `❌ Container ainda está sendo processado (Error 9007). Aguarde e tente novamente.`
      );
    }

    throw new Error(`❌ Falha ao publicar container: ${errorMsg}`);
  }
}

/**
 * Fluxo completo de publicação de um Reel no Instagram.
 *
 * @param videoUrl URL pública do vídeo
 * @param caption Legenda do reel
 * @param accessToken Token de acesso (opcional)
 * @param accountId ID da conta business do Instagram (opcional)
 * @returns ID da mídia publicada
 */
export async function publishReel(
  videoUrl: string,
  caption: string,
  accessToken?: string,
  accountId?: string
): Promise<{ mediaId: string }> {
  console.log('📱 Iniciando fluxo completo de publicação no Instagram...');
  const startTime = Date.now();

  const token = accessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const igAccountId = accountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  // Passo 1: Criar container
  const containerId = await createReelContainer(videoUrl, caption, token, igAccountId);

  // Passo 2: Aguardar processamento via polling
  console.log(`📱 Aguardando processamento do container (polling a cada ${POLL_INTERVAL_MS / 1000}s)...`);

  let attempts = 0;
  let containerReady = false;

  while (attempts < MAX_POLL_RETRIES) {
    attempts++;
    await sleep(POLL_INTERVAL_MS);

    try {
      const { status, error } = await checkContainerStatus(containerId, token);

      if (status === 'FINISHED') {
        containerReady = true;
        console.log(`📱 Container pronto após ${attempts} verificações`);
        break;
      }

      if (status === 'ERROR') {
        throw new Error(`❌ Container com erro: ${error || 'Erro desconhecido'}`);
      }

      // IN_PROGRESS - continuar polling
      if (attempts % 6 === 0) {
        // Log a cada 30s
        console.log(
          `📱 Ainda processando... (${attempts}/${MAX_POLL_RETRIES} tentativas, ` +
            `${((Date.now() - startTime) / 1000).toFixed(0)}s decorridos)`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Falha ao verificar')) {
        console.log(`📱 Erro de rede no polling, tentando novamente... (${attempts}/${MAX_POLL_RETRIES})`);
        continue;
      }
      throw error;
    }
  }

  if (!containerReady) {
    throw new Error(
      `❌ Timeout: container não ficou pronto após ${MAX_POLL_RETRIES} tentativas ` +
        `(${((Date.now() - startTime) / 1000).toFixed(0)}s)`
    );
  }

  // Passo 3: Publicar
  const mediaId = await publishContainer(containerId, token, igAccountId);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`📱 Publicação no Instagram concluída em ${totalTime}s (Media ID: ${mediaId})`);

  return { mediaId };
}

/**
 * Extrai mensagem de erro de uma resposta do axios ou erro genérico.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data;

    if (data?.error) {
      const fbError = data.error;
      return `[${fbError.code || 'N/A'}] ${fbError.message || 'Erro desconhecido'} (type: ${fbError.type || 'N/A'})`;
    }

    if (error.response) {
      return `HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 300)}`;
    }

    if (error.code === 'ECONNABORTED') {
      return 'Timeout na requisição à API do Instagram';
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
