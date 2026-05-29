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

const globalForOauthCache = globalThis as typeof globalThis & {
  __cachedPages?: Record<number, FbPageOption[]>;
};

export function setCachedPages(userId: number, pages: FbPageOption[]): void {
  if (!globalForOauthCache.__cachedPages) {
    globalForOauthCache.__cachedPages = {};
  }
  globalForOauthCache.__cachedPages[userId] = pages;
}

export function getCachedPages(userId: number): FbPageOption[] {
  return globalForOauthCache.__cachedPages?.[userId] || [];
}
