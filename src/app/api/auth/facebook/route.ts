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
 * GET /api/auth/facebook
 * Usuário já logado conectando (ou trocando) a página do Facebook/Instagram.
 * Devolve a URL de autorização para o front redirecionar.
 */
export async function GET(request: Request) {
  try {
    const user = await getLoggedInUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado. Faça login primeiro.' },
        { status: 401 }
      );
    }

    // "state" aleatório guardado em cookie httpOnly e validado no callback (anti-CSRF)
    const state = createFacebookState('connect');
    const cookieStore = await cookies();
    cookieStore.set(FB_STATE_COOKIE, state, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10, // 10 minutos
    });

    return NextResponse.json({ success: true, data: { authUrl: buildFacebookAuthUrl(request, 'connect', state) } });
  } catch (error) {
    console.error('❌ Erro ao gerar URL de autenticação do Facebook:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}
