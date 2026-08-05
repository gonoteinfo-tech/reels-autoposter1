import { NextRequest, NextResponse } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!SAFE_METHODS.has(request.method) && origin) {
    const expectedOrigin = process.env.APP_URL
      ? new URL(process.env.APP_URL).origin
      : request.nextUrl.origin;
    if (origin !== expectedOrigin) {
      return NextResponse.json({ success: false, error: 'Origem da requisição inválida.' }, { status: 403 });
    }
  }

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
