import { NextResponse } from 'next/server';
import { getLoggedInUser } from '@/services/auth';

export async function GET(request: Request) {
  try {
    // Verificar se o usuário está logado
    const user = await getLoggedInUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado. Faça login primeiro.' },
        { status: 401 }
      );
    }

    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { success: false, error: 'FACEBOOK_APP_ID não configurado no servidor' },
        { status: 500 }
      );
    }

    const host = request.headers.get('host') || new URL(request.url).host;
    const referer = request.headers.get('referer');
    let proto = request.headers.get('x-forwarded-proto') || 'http';
    
    if (referer && referer.startsWith('https://')) {
      proto = 'https';
    } else {
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1') || host.startsWith('192.168.') || host.startsWith('10.');
      if (!isLocal) {
        proto = 'https';
      }
    }
    
    const redirectUri = `${proto}://${host}/api/auth/facebook/callback`;

    // Escopos necessários para publicação e leitura
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish'
    ].join(',');

    // Passamos o userId no parâmetro state para validação adicional se necessário
    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${scopes}&response_type=code&state=${user.id}`;

    return NextResponse.json({ success: true, data: { authUrl } });
  } catch (error) {
    console.error('❌ Erro ao gerar URL de autenticação do Facebook:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}
