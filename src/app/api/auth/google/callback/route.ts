import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';
import crypto from 'crypto';
import {
  getUserByEmail,
  updateUserGoogleId,
  getUserById,
  createUser,
  createSession
} from '@/services/database';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error || !code) {
    console.error('❌ Erro no retorno do Google OAuth:', error, errorDescription);
    const details = errorDescription || error || 'Código de autorização ausente';
    return NextResponse.redirect(new URL(`/?error=oauth_failed&details=${encodeURIComponent(details)}`, request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ Credenciais do Google OAuth ausentes no servidor');
    return NextResponse.redirect(
      new URL('/?error=server_configuration&details=GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET nao configurado no .env', request.url)
    );
  }

  // Detectar protocolo
  const host = request.headers.get('host') || 'localhost:3000';
  let proto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https:') ? 'https' : '');
  if (!proto) {
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1') || host.startsWith('192.168.') || host.startsWith('10.');
    proto = isLocal ? 'http' : 'https';
  }
  const isSecure = proto === 'https';

  try {
    const appUrl = process.env.APP_URL;
    let redirectUri;
    if (appUrl) {
      redirectUri = `${appUrl.replace(/\/$/, '')}/api/auth/google/callback`;
    } else {
      redirectUri = `${proto}://${host}/api/auth/google/callback`;
    }

    // 1. Trocar código por tokens
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const { id_token } = response.data;
    if (!id_token) {
      throw new Error('id_token não foi retornado pelo Google');
    }

    // 2. Decodificar JWT do id_token sem verificação criptográfica externa
    const payloadPart = id_token.split('.')[1];
    if (!payloadPart) {
      throw new Error('id_token JWT inválido');
    }

    const payloadJson = Buffer.from(payloadPart, 'base64').toString('utf8');
    const googleProfile = JSON.parse(payloadJson) as {
      email: string;
      name: string;
      picture?: string;
      sub: string; // Google ID
    };

    if (!googleProfile.email) {
      throw new Error('E-mail não retornado pelo escopo do Google');
    }

    // 3. Obter ou Criar Usuário
    let user = getUserByEmail(googleProfile.email);

    if (user) {
      // Usuário existente. Se for o admin ou usuário com e-mail cadastrado, mas sem google_id ainda, vincula.
      if (!user.google_id) {
        updateUserGoogleId(user.id, googleProfile.sub);
        user = getUserById(user.id)!;
      }
    } else {
      // Novo usuário
      user = createUser({
        email: googleProfile.email,
        name: googleProfile.name,
        picture: googleProfile.picture || null,
        google_id: googleProfile.sub
      });
    }

    // 4. Criar Sessão
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expira em 7 dias

    createSession(sessionId, user.id, expiresAt);

    // 5. Configurar Cookie
    const cookieStore = await cookies();
    cookieStore.set('session', sessionId, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 7 dias
    });

    console.log(`🔑 Login efetuado com sucesso para: ${user.email} (ID: ${user.id})`);

    // Redirecionar para o painel
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (err: any) {
    console.error('❌ Falha ao processar callback de autenticação:', err.response?.data || err.message || err);
    const errorDetails = err.response?.data?.error_description || err.response?.data?.error || err.message || 'Erro desconhecido no processamento do token';
    return NextResponse.redirect(
      new URL(`/?error=callback_error&details=${encodeURIComponent(errorDetails)}`, request.url)
    );
  }
}
