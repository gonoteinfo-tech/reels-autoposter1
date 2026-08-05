import 'server-only';

import { consumeRateLimit } from './database';
import { SecurityError } from './security';

export function enforceUserRateLimit(
  userId: number,
  action: string,
  maxRequests: number,
  windowMs: number
): void {
  const result = consumeRateLimit(`${userId}:${action}`, maxRequests, windowMs);
  if (!result.allowed) {
    throw new SecurityError(
      `Muitas tentativas. Tente novamente em ${result.retryAfterSeconds} segundos.`,
      429
    );
  }
}
