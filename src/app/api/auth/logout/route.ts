import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSession } from '@/services/database';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    if (sessionCookie && sessionCookie.value) {
      deleteSession(sessionCookie.value);
    }

    // Limpar o cookie de sessão
    cookieStore.delete('session');

    console.log('🔑 Logout efetuado com sucesso');
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    console.error('❌ Erro no processamento do logout:', error);
    return NextResponse.redirect(new URL('/', request.url));
  }
}
