import { cookies } from 'next/headers';
import { getSession } from './database';
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
