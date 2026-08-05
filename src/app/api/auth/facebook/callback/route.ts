import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import axios from 'axios';
import { setCachedPages, type FbPageOption } from '@/services/oauth-cache';
import { getLoggedInUser } from '@/services/auth';
import { appUrl, constantTimeEqual } from '@/services/security';

interface FacebookTokenResponse {
  access_token?: string;
}

interface FacebookAccountsResponse {
  data?: Array<{
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: { id: string; username?: string; name?: string };
  }>;
}

function settingsRedirect(request: Request, status: 'success' | 'error'): NextResponse {
  return NextResponse.redirect(appUrl(request, `/dashboard/settings?auth=${status}`));
}

export async function GET(request: Request) {
  try {
    const user = await getLoggedInUser();
    if (!user) return settingsRedirect(request, 'error');

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const providerError = searchParams.get('error');

    const cookieStore = await cookies();
    const expectedState = cookieStore.get('facebook_oauth_state')?.value;
    cookieStore.delete('facebook_oauth_state');
    if (!expectedState || !state || !constantTimeEqual(expectedState, state)) {
      console.error('State OAuth do Facebook inválido ou ausente.');
      return settingsRedirect(request, 'error');
    }

    if (providerError || !code) return settingsRedirect(request, 'error');

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) return settingsRedirect(request, 'error');

    const redirectUri = appUrl(request, '/api/auth/facebook/callback').toString();
    const tokenRes = await axios.post<FacebookTokenResponse>(
      'https://graph.facebook.com/v21.0/oauth/access_token',
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const shortLivedToken = tokenRes.data.access_token;
    if (!shortLivedToken) throw new Error('Facebook não retornou o token de acesso.');

    const extendRes = await axios.post<FacebookTokenResponse>(
      'https://graph.facebook.com/v21.0/oauth/access_token',
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const longLivedToken = extendRes.data.access_token;
    if (!longLivedToken) throw new Error('Facebook não retornou o token estendido.');

    const accountsRes = await axios.get<FacebookAccountsResponse>(
      'https://graph.facebook.com/v21.0/me/accounts',
      {
        headers: { Authorization: `Bearer ${longLivedToken}` },
        params: { fields: 'name,id,access_token,instagram_business_account{id,username,name}' },
      }
    );

    const pages: FbPageOption[] = (accountsRes.data.data ?? []).map((page) => ({
      id: page.id,
      name: page.name,
      access_token: page.access_token,
      instagram_business_account: page.instagram_business_account
        ? {
            id: page.instagram_business_account.id,
            username: page.instagram_business_account.username ?? '',
            name: page.instagram_business_account.name ?? '',
          }
        : undefined,
    }));

    setCachedPages(user.id, pages);
    console.log(`OAuth do Facebook concluído para o usuário ${user.id}; ${pages.length} página(s) em cache.`);
    return settingsRedirect(request, 'success');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Falha no callback OAuth do Facebook:', error.response?.status);
    } else {
      console.error('Falha no callback OAuth do Facebook:', error);
    }
    return settingsRedirect(request, 'error');
  }
}
