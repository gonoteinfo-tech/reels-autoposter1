import 'server-only';

import crypto from 'crypto';

export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.')
  );
}

/**
 * Retorna a origem canônica da aplicação. Em produção, APP_URL é obrigatório
 * para que cabeçalhos Host/X-Forwarded-* não controlem URLs OAuth ou redirects.
 */
export function getAppOrigin(request: Request): URL {
  const configuredUrl = process.env.APP_URL?.trim();
  if (configuredUrl) {
    const url = new URL(configuredUrl);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new SecurityError('APP_URL deve usar HTTPS em produção', 500);
    }
    return new URL(url.origin);
  }

  const requestUrl = new URL(request.url);
  if (process.env.NODE_ENV === 'production' && !isLocalHostname(requestUrl.hostname)) {
    throw new SecurityError('APP_URL não configurada no servidor', 500);
  }

  return new URL(requestUrl.origin);
}

export function appUrl(request: Request, pathname: string): URL {
  return new URL(pathname, getAppOrigin(request));
}

/** Proteção adicional contra CSRF para endpoints mutáveis baseados em cookie. */
export function assertSameOrigin(request: Request): void {
  const originHeader = request.headers.get('origin');
  if (!originHeader) return;

  let receivedOrigin: string;
  try {
    receivedOrigin = new URL(originHeader).origin;
  } catch {
    throw new SecurityError('Cabeçalho Origin inválido', 403);
  }

  if (receivedOrigin !== getAppOrigin(request).origin) {
    throw new SecurityError('Origem da requisição não autorizada', 403);
  }
}

export function isSecureRequest(request: Request): boolean {
  return getAppOrigin(request).protocol === 'https:';
}

export function randomState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function constantTimeEqual(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function safeInternalError(error: unknown, fallback = 'Erro interno do servidor'): string {
  if (error instanceof SecurityError) return error.message;
  return fallback;
}
