import 'server-only';

export interface FbPageOption {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
    username: string;
    name: string;
  };
}

interface CachedPages {
  pages: FbPageOption[];
  expiresAt: number;
}

const globalForOauthCache = globalThis as typeof globalThis & {
  __cachedPages?: Record<number, CachedPages>;
};

const CACHE_TTL_MS = 10 * 60 * 1000;

export function setCachedPages(userId: number, pages: FbPageOption[]): void {
  if (!globalForOauthCache.__cachedPages) {
    globalForOauthCache.__cachedPages = {};
  }
  globalForOauthCache.__cachedPages[userId] = {
    pages,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

export function getCachedPages(userId: number): FbPageOption[] {
  const cached = globalForOauthCache.__cachedPages?.[userId];
  if (!cached) return [];
  if (cached.expiresAt <= Date.now()) {
    clearCachedPages(userId);
    return [];
  }
  return cached.pages;
}

export function getCachedPage(userId: number, pageId: string): FbPageOption | null {
  return getCachedPages(userId).find((page) => page.id === pageId) || null;
}

export function clearCachedPages(userId: number): void {
  if (globalForOauthCache.__cachedPages) {
    delete globalForOauthCache.__cachedPages[userId];
  }
}
