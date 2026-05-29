import { NextResponse } from 'next/server';
import { getCachedPages } from '@/services/oauth-cache';
import { getLoggedInUser } from '@/services/auth';

export async function GET() {
  try {
    const user = await getLoggedInUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const pages = getCachedPages(user.id);
    return NextResponse.json({ success: true, data: { pages } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}
