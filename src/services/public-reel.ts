import 'server-only';

import type { PublicReel, Reel } from '@/types';

export function toPublicReel(reel: Reel): PublicReel {
  const { local_path, processed_path, direct_video_url: _directVideoUrl, ...publicFields } = reel;
  void _directVideoUrl;
  return {
    ...publicFields,
    has_local_video: Boolean(local_path),
    has_processed_video: Boolean(processed_path),
  };
}
