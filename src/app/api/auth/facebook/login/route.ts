import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getLoggedInUser } from '@/services/auth';
import {
  FB_STATE_COOKIE,
  buildFacebookAuthUrl,
  createFacebookState,
  isSecureRequest,
} from '@/services/facebook-oauth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/facebook/login
 * Entrar (ou criar conta) com o Facebook. Na mesma autorização a pessoa já concede
 * acesso às páginas e ao Instagram, e depois só escolhe a página nas configurações.
 */
export async function GET(request: Request) {
  const user = await getLoggedInUser();
  if (user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  try {
    const state = createFacebookState('login');
    const cookieStore = await cookies();
    cookieStore.set(FB_STATE_COOKIE, state, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10, // 10 minutos
    });

    return NextResponse.redirect(buildFacebookAuthUrl(request, 'login', state));
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro interno';
    console.error('❌ Erro ao iniciar login com Facebook:', msg);
    return NextResponse.redirect(
      new URL(`/?error=server_configuration&details=${encodeURIComponent(msg)}`, request.url)
    );
  }
}
