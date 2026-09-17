import { NextRequest, NextResponse } from 'next/server';
import { testBrightDataConnection, isBrightDataConfigured } from '@/services/brightdata-discoverer';
import { getLoggedInUser } from '@/services/auth';

export const dynamic = 'force-dynamic';

/** GET /api/brightdata/test — testa a conexão com a Bright Data */
export async function GET(_request: NextRequest) {
  const user = await getLoggedInUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 });
  }

  if (!isBrightDataConfigured()) {
    return NextResponse.json({
      success: false,
      error: 'BRIGHTDATA_API_TOKEN não configurado no ambiente do servidor',
      configured: false,
    });
  }

  try {
    const result = await testBrightDataConnection();
    return NextResponse.json({
      success: result.ok,
      configured: true,
      data: result.ok ? { user: result.user } : undefined,
      error: result.error,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
