import { NextResponse } from 'next/server';
import axios from 'axios';
import { setCachedPages } from '@/services/oauth-cache';
import { getLoggedInUser } from '@/services/auth';

export async function GET(request: Request) {
  try {
    // 0. Autenticar usuário
    const user = await getLoggedInUser();
    if (!user) {
      console.error('❌ Callback do Facebook acionado sem usuário autenticado.');
      return NextResponse.redirect(
        new URL('/dashboard/settings?auth=error&message=Usuário não autenticado no sistema', request.url)
      );
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const errorMsg = searchParams.get('error_message');

    if (errorMsg || !code) {
      console.error('❌ Erro no retorno do Facebook OAuth:', errorMsg);
      return NextResponse.redirect(
        new URL(`/dashboard/settings?auth=error&message=${encodeURIComponent(errorMsg || 'Código não fornecido')}`, request.url)
      );
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.redirect(
        new URL('/dashboard/settings?auth=error&message=Credenciais do App Meta não configuradas', request.url)
      );
    }

    // A URI de redirecionamento precisa corresponder exatamente à enviada na etapa 1
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

    // 1. Trocar código por Token de Acesso de Curta Duração
    const tokenExchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&client_secret=${appSecret}&code=${code}`;

    const tokenRes = await axios.get(tokenExchangeUrl);
    const shortLivedToken = tokenRes.data.access_token;

    if (!shortLivedToken) {
      throw new Error('Falha ao obter token de acesso de curta duração');
    }

    // 2. Estender para Token de Usuário de Longa Duração (60 dias)
    const extendUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    const extendRes = await axios.get(extendUrl);
    const longLivedToken = extendRes.data.access_token;

    if (!longLivedToken) {
      throw new Error('Falha ao estender token de acesso de usuário');
    }

    // 3. Buscar Páginas do Usuário e Contas do Instagram vinculadas
    const accountsUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}&fields=name,id,access_token,instagram_business_account{id,username,name}`;
    const accountsRes = await axios.get(accountsUrl);
    const pages = accountsRes.data.data || [];

    // Formatar e armazenar no cache em memória
    const formattedPages = pages.map((page: any) => ({
      id: page.id,
      name: page.name,
      access_token: page.access_token,
      instagram_business_account: page.instagram_business_account
        ? {
            id: page.instagram_business_account.id,
            username: page.instagram_business_account.username,
            name: page.instagram_business_account.name,
          }
        : undefined,
    }));

    // Cachear no serviço em memória, associado ao userId
    setCachedPages(user.id, formattedPages);

    console.log(`🔑 OAuth concluído para o Usuário ${user.id}. ${formattedPages.length} páginas cacheadas para configuração.`);

    // Redireciona de volta para as configurações com flag de sucesso
    return NextResponse.redirect(new URL('/dashboard/settings?auth=success', request.url));
  } catch (error: any) {
    const msg = error.response?.data?.error?.message || error.message || 'Erro desconhecido';
    console.error('❌ Erro no fluxo de Callback OAuth do Facebook:', msg);
    return NextResponse.redirect(
      new URL(`/dashboard/settings?auth=error&message=${encodeURIComponent(msg)}`, request.url)
    );
  }
}
