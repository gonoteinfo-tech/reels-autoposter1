import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getLoggedInUser } from '@/services/auth';
import { appUrl, isSecureRequest, randomState, safeInternalError } from '@/services/security';

export async function GET(request: Request) {
  try {
    const user = await getLoggedInUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
    }

    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { success: false, error: 'FACEBOOK_APP_ID não configurado no servidor.' },
        { status: 500 }
      );
    }

    const state = randomState();
    const cookieStore = await cookies();
    cookieStore.set('facebook_oauth_state', state, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      path: '/api/auth/facebook',
      maxAge: 10 * 60,
    });

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: appUrl(request, '/api/auth/facebook/callback').toString(),
      scope: [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'instagram_basic',
        'instagram_content_publish',
      ].join(','),
      response_type: 'code',
      state,
    });

    return NextResponse.json({
      success: true,
      data: { authUrl: `https://www.facebook.com/v21.0/dialog/oauth?${params}` },
    });
  } catch (error) {
    console.error('Erro ao gerar URL de autenticação do Facebook:', error);
    return NextResponse.json(
      { success: false, error: safeInternalError(error, 'Erro interno do servidor.') },
      { status: 500 }
    );
  }
}
