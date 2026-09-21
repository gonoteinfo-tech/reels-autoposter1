import { cookies } from 'next/headers';
import crypto from 'crypto';
import { createSession, getSession } from './database';
import type { User } from '@/types';

/**
 * Obtém o usuário atualmente autenticado a partir dos cookies de sessão.
 * Suporta Next.js 16 (cookies() é assíncrono).
 */
export async function getLoggedInUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    
    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }

    const session = getSession(sessionCookie.value);
    if (!session) {
      return null;
    }

    return session.user;
  } catch (error) {
    console.error('❌ Erro ao obter usuário autenticado:', error);
    return null;
  }
}

/**
 * Cria uma sessão de login para o usuário e grava o cookie "session" (7 dias).
 * Só pode ser chamado em Route Handlers ou Server Functions.
 */
export async function startUserSession(userId: number, secure: boolean): Promise<void> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  createSession(sessionId, userId, expiresAt);

  const cookieStore = await cookies();
  cookieStore.set('session', sessionId, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}
