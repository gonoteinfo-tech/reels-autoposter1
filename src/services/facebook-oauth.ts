import axios from 'axios';
import crypto from 'crypto';
import type { FbPageOption } from './oauth-cache';

/** API Graph da Meta (sobrescrevível para testes locais com um servidor simulado) */
const GRAPH = process.env.FACEBOOK_GRAPH_URL || 'https://graph.facebook.com/v21.0';

/** Nome do cookie que guarda o "state" anti-CSRF do fluxo OAuth do Facebook */
export const FB_STATE_COOKIE = 'fb_oauth_state';

/**
 * Modo do fluxo:
 * - login: pessoa sem sessão entrando/criando conta com o Facebook
 * - connect: usuário já logado conectando (ou trocando) a página do Facebook/Instagram
 */
export type FacebookOAuthMode = 'login' | 'connect';

/** Permissões para publicar na página e no Instagram vinculado */
const PAGE_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
];

/** Permissões extras do login: identificar a pessoa */
const LOGIN_SCOPES = ['public_profile', 'email'];

/** Detecta se a requisição chegou por HTTPS (direto ou atrás de proxy) */
export function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https:') ? 'https' : '');
  return proto === 'https' || (!!process.env.APP_URL && process.env.APP_URL.startsWith('https:'));
}

/**
 * URL de retorno do OAuth. Precisa ser idêntica no diálogo e na troca do código,
 * e estar cadastrada em "URIs de redirecionamento do OAuth válidos" no app da Meta.
 */
export function getFacebookRedirectUri(request: Request): string {
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    return `${appUrl.replace(/\/$/, '')}/api/auth/facebook/callback`;
  }

  const host = request.headers.get('host') || new URL(request.url).host;
  let proto = request.headers.get('x-forwarded-proto') || '';
  if (!proto) {
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1') || host.startsWith('192.168.') || host.startsWith('10.');
    proto = isLocal ? 'http' : 'https';
  }
  return `${proto}://${host}/api/auth/facebook/callback`;
}

/** Gera o valor do "state": modo + token aleatório (validado contra o cookie no callback) */
export function createFacebookState(mode: FacebookOAuthMode): string {
  return `${mode}.${crypto.randomBytes(32).toString('hex')}`;
}

/** Extrai o modo de um "state" já validado */
export function parseFacebookStateMode(state: string): FacebookOAuthMode | null {
  const mode = state.split('.')[0];
  return mode === 'login' || mode === 'connect' ? mode : null;
}

/** Monta a URL do diálogo de autorização do Facebook */
export function buildFacebookAuthUrl(request: Request, mode: FacebookOAuthMode, state: string): string {
  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) throw new Error('FACEBOOK_APP_ID não configurado no servidor');

  const scopes = mode === 'login' ? [...LOGIN_SCOPES, ...PAGE_SCOPES] : PAGE_SCOPES;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getFacebookRedirectUri(request),
    scope: scopes.join(','),
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

/** Perfil básico da pessoa no Facebook */
export interface FacebookProfile {
  id: string;
  name: string;
  email?: string;
  picture?: string;
}

/**
 * Troca o código do OAuth por um token de usuário de longa duração (~60 dias).
 */
export async function exchangeCodeForLongLivedToken(request: Request, code: string): Promise<string> {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) throw new Error('Credenciais do App Meta não configuradas');

  const tokenRes = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: getFacebookRedirectUri(request),
      code,
    },
  });
  const shortLivedToken = tokenRes.data.access_token;
  if (!shortLivedToken) throw new Error('Falha ao obter token de acesso de curta duração');

  const extendRes = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });
  const longLivedToken = extendRes.data.access_token;
  if (!longLivedToken) throw new Error('Falha ao estender token de acesso de usuário');

  return longLivedToken;
}

/** Busca o perfil da pessoa (id, nome, e-mail se autorizado, foto) */
export async function fetchFacebookProfile(userToken: string): Promise<FacebookProfile> {
  const res = await axios.get(`${GRAPH}/me`, {
    params: { fields: 'id,name,email,picture.type(large)', access_token: userToken },
  });
  const data = res.data as { id?: string; name?: string; email?: string; picture?: { data?: { url?: string } } };
  if (!data.id) throw new Error('O Facebook não retornou o ID do usuário');

  return {
    id: data.id,
    name: data.name || 'Usuário do Facebook',
    email: data.email || undefined,
    picture: data.picture?.data?.url,
  };
}

/** Busca as páginas que a pessoa administra e as contas do Instagram vinculadas */
export async function fetchFacebookPages(userToken: string): Promise<FbPageOption[]> {
  const res = await axios.get(`${GRAPH}/me/accounts`, {
    params: {
      fields: 'name,id,access_token,instagram_business_account{id,username,name}',
      access_token: userToken,
    },
  });

  const pages = (res.data?.data || []) as Array<{
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: { id: string; username: string; name: string };
  }>;

  return pages.map((page) => ({
    id: page.id,
    name: page.name,
    access_token: page.access_token,
    instagram_business_account: page.instagram_business_account
      ? {
          id: page.instagram_business_account.id,
          username: page.instagram_business_account.username,
          name: page.instagram_business_account.name,
        }
      : undefined,
  }));
}
