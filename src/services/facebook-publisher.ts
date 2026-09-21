import axios, { AxiosError } from 'axios';

const BASE_URL = 'https://graph.facebook.com/v21.0';

/**
 * Utilitário para aguardar N milissegundos.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Publica um vídeo na página do Facebook.
 *
 * @param videoUrl URL pública do vídeo
 * @param title Título do vídeo
 * @param description Descrição/legenda do vídeo
 * @param accessToken Token de acesso (opcional)
 * @param pageId ID da página (opcional)
 * @returns ID do post publicado
 */
export async function publishVideoToPage(
  videoUrl: string,
  title: string,
  description: string,
  accessToken?: string,
  pageId?: string
): Promise<string> {
  console.log('📘 Publicando vídeo na página do Facebook...');

  const token = accessToken;
  const fbPageId = pageId;

  if (!token) {
    throw new Error('❌ Nenhuma página do Facebook conectada (token ausente).');
  }
  if (!fbPageId) {
    throw new Error('❌ Nenhuma página do Facebook conectada (ID ausente).');
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/${fbPageId}/videos`,
      null,
      {
        params: {
          file_url: videoUrl,
          title: title,
          description: description,
          access_token: token,
          published: 'true',
        },
        timeout: 120000, // 2 minutos para upload
      }
    );

    const videoId = response.data.id;
    console.log(`📘 Vídeo publicado no Facebook! Video ID: ${videoId}`);
    return videoId;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);
    throw new Error(`❌ Falha ao publicar vídeo no Facebook: ${errorMsg}`);
  }
}

/**
 * Publica um vídeo como Reel na página do Facebook.
 *
 * @param videoUrl URL pública do vídeo
 * @param description Descrição/legenda do reel
 * @param accessToken Token de acesso (opcional)
 * @param pageId ID da página (opcional)
 * @returns ID do post publicado
 */
export async function publishReelToPage(
  videoUrl: string,
  description: string,
  accessToken?: string,
  pageId?: string
): Promise<string> {
  console.log('📘 Publicando Reel na página do Facebook...');

  const token = accessToken;
  const fbPageId = pageId;

  if (!token) {
    throw new Error('❌ Nenhuma página do Facebook conectada (token ausente).');
  }
  if (!fbPageId) {
    throw new Error('❌ Nenhuma página do Facebook conectada (ID ausente).');
  }

  try {
    // Passo 1: Iniciar sessão de upload
    console.log('📘 [1/3] Iniciando sessão de upload...');
    const startResponse = await axios.post(
      `${BASE_URL}/${fbPageId}/video_reels`,
      null,
      {
        params: {
          upload_phase: 'start',
          access_token: token,
        },
        timeout: 30000,
      }
    );

    const videoId = startResponse.data.video_id;
    const uploadUrl = startResponse.data.upload_url || `https://rupload.facebook.com/video-upload/v21.0/${videoId}`;

    if (!videoId) {
      throw new Error('Resposta inválida: video_id não retornado na fase start');
    }
    console.log(`📘 Sessão de upload criada. Video ID: ${videoId}`);

    // Passo 2: Transferir vídeo via URL (usando rupload.facebook.com)
    console.log('📘 [2/3] Transferindo vídeo via URL para o RUpload...');
    await axios.post(
      uploadUrl,
      null,
      {
        headers: {
          'Authorization': `OAuth ${token}`,
          'file_url': videoUrl,
        },
        timeout: 120000, // 2 minutos para transferência
      }
    );

    console.log('📘 Transferência concluída');

    // Pequena pausa para processamento
    await sleep(3000);

    // Passo 3: Finalizar e publicar
    console.log('📘 [3/3] Finalizando e publicando...');
    const finishResponse = await axios.post(
      `${BASE_URL}/${fbPageId}/video_reels`,
      null,
      {
        params: {
          upload_phase: 'finish',
          video_id: videoId,
          video_state: 'PUBLISHED',
          title: description.substring(0, 100), // Título limitado
          description: description,
          access_token: token,
        },
        timeout: 30000,
      }
    );

    const postId = finishResponse.data.post_id || finishResponse.data.id || videoId;
    console.log(`📘 Reel publicado no Facebook! Post ID: ${postId}`);

    return postId;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('❌')) {
      throw error;
    }

    const errorMsg = extractErrorMessage(error);
    throw new Error(`❌ Falha ao publicar Reel no Facebook: ${errorMsg}`);
  }
}

/**
 * Verifica o status da página do Facebook e permissões de publicação.
 *
 * @param accessToken Token de acesso (opcional)
 * @param pageId ID da página (opcional)
 * @returns Informações básicas da página
 */
export async function verifyPageAccess(
  accessToken?: string,
  pageId?: string
): Promise<{
  id: string;
  name: string;
  canPublish: boolean;
}> {
  console.log('📘 Verificando acesso à página do Facebook...');

  const token = accessToken;
  const fbPageId = pageId;

  if (!token) {
    throw new Error('❌ Token do Facebook não fornecido.');
  }
  if (!fbPageId) {
    throw new Error('❌ ID da página Facebook não fornecido.');
  }

  try {
    const response = await axios.get(`${BASE_URL}/${fbPageId}`, {
      params: {
        fields: 'id,name,access_token',
        access_token: token,
      },
      timeout: 15000,
    });

    const result = {
      id: response.data.id,
      name: response.data.name,
      canPublish: true,
    };

    console.log(`📘 Página verificada: "${result.name}" (ID: ${result.id})`);
    return result;
  } catch (error) {
    const errorMsg = extractErrorMessage(error);

    if (errorMsg.includes('190') || errorMsg.includes('expired')) {
      console.error('📘 Token de acesso expirado ou inválido');
      return { id: fbPageId, name: 'Unknown', canPublish: false };
    }

    throw new Error(`❌ Falha ao verificar acesso à página: ${errorMsg}`);
  }
}

/**
 * Obtém insights básicos de um post publicado.
 *
 * @param postId ID do post no Facebook
 * @param accessToken Token de acesso (opcional)
 * @returns Métricas do post
 */
export async function getPostInsights(
  postId: string,
  accessToken?: string
): Promise<{
  views: number;
  likes: number;
  shares: number;
  comments: number;
}> {
  const token = accessToken;

  if (!token) {
    return { views: 0, likes: 0, shares: 0, comments: 0 };
  }

  try {
    const response = await axios.get(`${BASE_URL}/${postId}`, {
      params: {
        fields: 'views,likes.summary(true),shares,comments.summary(true)',
        access_token: token,
      },
      timeout: 15000,
    });

    return {
      views: response.data.views || 0,
      likes: response.data.likes?.summary?.total_count || 0,
      shares: response.data.shares?.count || 0,
      comments: response.data.comments?.summary?.total_count || 0,
    };
  } catch {
    return { views: 0, likes: 0, shares: 0, comments: 0 };
  }
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
      return 'Timeout na requisição à API do Facebook';
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
