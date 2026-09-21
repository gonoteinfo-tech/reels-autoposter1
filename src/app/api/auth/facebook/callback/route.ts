import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { setCachedPages } from '@/services/oauth-cache';
import { getLoggedInUser, startUserSession } from '@/services/auth';
import {
  createUser,
  ensureProIfListed,
  getUserByEmail,
  getUserByFacebookId,
  getUserById,
  updateUserFacebookId,
} from '@/services/database';
import {
  FB_STATE_COOKIE,
  exchangeCodeForLongLivedToken,
  fetchFacebookPages,
  fetchFacebookProfile,
  isSecureRequest,
  parseFacebookStateMode,
  type FacebookProfile,
} from '@/services/facebook-oauth';
import type { User } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Encontra a conta da pessoa pelo Facebook ID; senão, vincula a uma conta existente
 * com o mesmo e-mail (ex.: quem já entrava com Google); senão, cria uma conta nova.
 */
function findOrCreateFacebookUser(profile: FacebookProfile): User {
  const byFacebookId = getUserByFacebookId(profile.id);
  if (byFacebookId) return byFacebookId;

  if (profile.email) {
    const byEmail = getUserByEmail(profile.email);
    if (byEmail) {
      if (!byEmail.facebook_id) updateUserFacebookId(byEmail.id, profile.id);
      return getUserById(byEmail.id)!;
    }
  }

  // Sem e-mail (a pessoa negou a permissão ou a conta não tem): e-mail interno único
  return createUser({
    email: profile.email || `facebook-${profile.id}@users.noreply.local`,
    name: profile.name,
    picture: profile.picture || null,
    facebook_id: profile.id,
  });
}

/**
 * GET /api/auth/facebook/callback
 * Retorno do Facebook para os dois fluxos:
 * - login: cria/entra na conta, abre a sessão e leva para a escolha da página
 * - connect: usuário já logado conectando a página
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const fbError = searchParams.get('error_message') || searchParams.get('error_description') || searchParams.get('error');

  // Validar o "state" contra o cookie (uso único) — protege contra CSRF
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(FB_STATE_COOKIE)?.value;
  cookieStore.delete(FB_STATE_COOKIE);
  const mode = state && expectedState && state === expectedState ? parseFacebookStateMode(state) : null;

  const failTo = (target: 'login' | 'connect', message: string) =>
    NextResponse.redirect(
      new URL(
        target === 'login'
          ? `/?error=facebook_error&details=${encodeURIComponent(message)}`
          : `/dashboard/settings?auth=error&message=${encodeURIComponent(message)}`,
        request.url
      )
    );

  if (!mode) {
    console.error('❌ State OAuth do Facebook inválido ou ausente (possível CSRF ou link expirado)');
    return failTo('login', 'Sessão de autorização expirada ou inválida. Tente entrar novamente.');
  }

  if (fbError || !code) {
    console.error('❌ Erro no retorno do Facebook OAuth:', fbError);
    return failTo(mode, fbError || 'Autorização cancelada ou código não fornecido');
  }

  try {
    const userToken = await exchangeCodeForLongLivedToken(request, code);
    const [profile, pages] = await Promise.all([
      fetchFacebookProfile(userToken),
      fetchFacebookPages(userToken),
    ]);

    let user: User;

    if (mode === 'login') {
      user = findOrCreateFacebookUser(profile);
      ensureProIfListed(user.email);
      user = getUserById(user.id)!;
      await startUserSession(user.id, isSecureRequest(request));
      console.log(`🔑 Login com Facebook: ${user.name} (ID: ${user.id}, FB: ${profile.id})`);
    } else {
      const loggedIn = await getLoggedInUser();
      if (!loggedIn) {
        return failTo('login', 'Sua sessão expirou. Entre novamente para conectar o Facebook.');
      }
      user = loggedIn;

      // Vincula o Facebook à conta, para a pessoa poder entrar com ele depois —
      // a menos que esse Facebook já pertença a outra conta
      const owner = getUserByFacebookId(profile.id);
      if (!user.facebook_id && !owner) {
        updateUserFacebookId(user.id, profile.id);
      }
    }

    // Páginas ficam em cache para a pessoa escolher nas configurações
    setCachedPages(user.id, pages);
    console.log(`🔑 OAuth do Facebook (${mode}) concluído para o Usuário ${user.id}. ${pages.length} páginas disponíveis.`);

    return NextResponse.redirect(new URL('/dashboard/settings?auth=success', request.url));
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
    const msg = err.response?.data?.error?.message || err.message || 'Erro desconhecido';
    console.error(`❌ Erro no callback do Facebook (${mode}):`, msg);
    return failTo(mode, msg);
  }
}
