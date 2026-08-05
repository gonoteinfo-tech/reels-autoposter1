import 'server-only';

import type { AppSettings, PublicAppSettings } from '@/types';

export function toPublicSettings(settings: AppSettings): PublicAppSettings {
  const { facebook_page_access_token, ...publicSettings } = settings;
  return {
    ...publicSettings,
    facebook_page_access_token_configured: Boolean(facebook_page_access_token),
  };
}
