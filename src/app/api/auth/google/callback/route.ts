import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';
import crypto from 'crypto';
import {
  getUserByEmail,
  getUserByGoogleId,
  updateUserGoogleId,
  getUserById,
  createUser,
  createSession,
  ensureProIfListed,
} from '@/services/database';
import { appUrl, constantTimeEqual, isSecureRequest } from '@/services/security';

export const dynamic = 'force-dynamic';

interface GoogleTokenResponse {
  access_token?: string;
}

interface GoogleProfile {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  sub?: string;
}

function homeRedirect(request: Request, error?: string): NextResponse {
  const suffix = error ? `?error=${encodeURIComponent(error)}` : '';
  return NextResponse.redirect(appUrl(request, `/${suffix}`));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const cookieStore = await cookies();
  const expectedState = cookieStore.get('google_oauth_state')?.value;
  cookieStore.delete('google_oauth_state');
  if (!expectedState || !state || !constantTimeEqual(expectedState, state)) {
    console.error('State OAuth do Google inválido ou ausente.');
    return homeRedirect(request, 'invalid_state');
  }
  if (searchParams.get('error') || !code) return homeRedirect(request, 'oauth_failed');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return homeRedirect(request, 'server_configuration');

  try {
    const tokenResponse = await axios.post<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: appUrl(request, '/api/auth/google/callback').toString(),
        grant_type: 'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) throw new Error('Google não retornou o token de acesso.');

    const profileResponse = await axios.get<GoogleProfile>(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const profile = profileResponse.data;
    if (!profile.email || !profile.email_verified || !profile.sub) {
      throw new Error('A conta Google não retornou um e-mail verificado.');
    }

    const email = profile.email.trim().toLowerCase();
    let user = getUserByGoogleId(profile.sub);
    if (!user) {
      user = getUserByEmail(email);
      if (user?.google_id && user.google_id !== profile.sub) {
        throw new Error('Esta conta já está vinculada a outra identidade Google.');
      }
      if (user && !user.google_id) {
        updateUserGoogleId(user.id, profile.sub);
        user = getUserById(user.id);
      }
    }
    if (!user) {
      user = createUser({
        email,
        name: profile.name || email,
        picture: profile.picture || null,
        google_id: profile.sub,
      });
    }

    ensureProIfListed(user.email);
    user = getUserById(user.id) ?? user;

    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    createSession(sessionId, user.id, expiresAt);
    cookieStore.set('session', sessionId, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return NextResponse.redirect(appUrl(request, '/dashboard'));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Falha no callback OAuth do Google:', error.response?.status);
    } else {
      console.error('Falha no callback OAuth do Google:', error);
    }
    return homeRedirect(request, 'callback_error');
  }
}
