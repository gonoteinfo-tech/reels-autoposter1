import { NextRequest, NextResponse } from 'next/server';
import { testApifyConnection, isApifyConfigured } from '@/services/apify-discoverer';
import { getLoggedInUser } from '@/services/auth';

export const dynamic = 'force-dynamic';

/** GET /api/apify/test — testa a conexão com a Apify */
export async function GET(_request: NextRequest) {
  const user = await getLoggedInUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 });
  }

  if (!isApifyConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'APIFY_TOKEN não configurado no ambiente do servidor',
      configured: false,
    });
  }

  try {
    const result = await testApifyConnection();
    return NextResponse.json({
      success: result.ok,
      configured: true,
      data: result.ok ? { user: result.user } : undefined,
      error: result.error,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
