import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { appUrl, isSecureRequest, randomState, safeInternalError } from '@/services/security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { success: false, error: 'Configuração do Google OAuth ausente.' },
        { status: 500 }
      );
    }

    const state = randomState();
    const cookieStore = await cookies();
    cookieStore.set('google_oauth_state', state, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 10 * 60,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: appUrl(request, '/api/auth/google/callback').toString(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  } catch (error) {
    console.error('Erro ao iniciar OAuth do Google:', error);
    return NextResponse.json(
      { success: false, error: safeInternalError(error, 'Erro interno do servidor.') },
      { status: 500 }
    );
  }
}
