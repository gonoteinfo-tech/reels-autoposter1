import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error('❌ GOOGLE_CLIENT_ID não configurado no .env');
    return NextResponse.json(
      { success: false, error: 'Configuração do Google OAuth ausente.' },
      { status: 500 }
    );
  }

  // Obter a URL de redirecionamento (via variável de ambiente ou dinamicamente)
  const appUrl = process.env.APP_URL;
  const host = request.headers.get('host') || 'localhost:3000';
  let redirectUri;
  if (appUrl) {
    redirectUri = `${appUrl.replace(/\/$/, '')}/api/auth/google/callback`;
  } else {
    // Detectar protocolo de forma inteligente
    let proto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https:') ? 'https' : '');
    if (!proto) {
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1') || host.startsWith('192.168.') || host.startsWith('10.');
      proto = isLocal ? 'http' : 'https';
    }
    redirectUri = `${proto}://${host}/api/auth/google/callback`;
  }


  // Construir a URL de autorização do Google
  const googleAuthUrl = 
    `https://accounts.google.com/o/oauth2/v2/auth?` + 
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('openid email profile')}` +
    `&access_type=offline` +
    `&prompt=consent`;

  return NextResponse.redirect(googleAuthUrl);
}
