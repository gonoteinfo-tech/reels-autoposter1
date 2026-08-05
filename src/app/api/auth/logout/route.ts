import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSession } from '@/services/database';
import { appUrl, assertSameOrigin, SecurityError } from '@/services/security';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session')?.value;
    if (sessionId) deleteSession(sessionId);
    cookieStore.delete('session');
    return NextResponse.redirect(appUrl(request, '/'), 303);
  } catch (error) {
    if (error instanceof SecurityError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Erro no processamento do logout:', error);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
