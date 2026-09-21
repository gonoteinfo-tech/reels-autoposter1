import type { AppSettings } from '@/types';

/** ID do administrador — dono da instalação original de usuário único */
const ADMIN_USER_ID = 1;

/** Credenciais que um usuário usa para publicar */
export interface PublishCredentials {
  pageToken?: string;
  pageId?: string;
  igAccountId?: string;
}

/**
 * Credenciais de publicação do usuário, a partir da página que ELE conectou.
 *
 * As variáveis FACEBOOK_PAGE_ACCESS_TOKEN / FACEBOOK_PAGE_ID / INSTAGRAM_BUSINESS_ACCOUNT_ID
 * do .env só valem para o administrador (compatibilidade com a instalação de usuário único).
 * Para qualquer outra conta, usá-las publicaria os reels dela na página do administrador.
 */
export function getPublishCredentials(userId: number, settings: AppSettings): PublishCredentials {
  const allowEnv = userId === ADMIN_USER_ID;
  const pick = (own: string | undefined, envKey: string) =>
    own || (allowEnv ? process.env[envKey] : undefined) || undefined;

  return {
    pageToken: pick(settings.facebook_page_access_token, 'FACEBOOK_PAGE_ACCESS_TOKEN'),
    pageId: pick(settings.facebook_page_id, 'FACEBOOK_PAGE_ID'),
    igAccountId: pick(settings.instagram_business_account_id, 'INSTAGRAM_BUSINESS_ACCOUNT_ID'),
  };
}

/** Indica se o usuário tem para onde publicar (página conectada, com ou sem Instagram) */
export function hasPublishDestination(credentials: PublishCredentials): boolean {
  return !!credentials.pageToken && (!!credentials.pageId || !!credentials.igAccountId);
}
