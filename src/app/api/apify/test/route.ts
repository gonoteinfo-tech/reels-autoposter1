import { NextResponse } from 'next/server';
import { testApifyConnection, isApifyConfigured } from '@/services/apify-discoverer';
import { getLoggedInUser } from '@/services/auth';
import { enforceUserRateLimit } from '@/services/rate-limit';
import { SecurityError } from '@/services/security';

export const dynamic = 'force-dynamic';

/** GET /api/apify/test — testa a conexão com a Apify */
export async function POST() {
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
    enforceUserRateLimit(user.id, 'apify-test', 10, 10 * 60 * 1000);
    const result = await testApifyConnection();
    return NextResponse.json({
      success: result.ok,
      configured: true,
      data: result.ok ? { user: result.user } : undefined,
      error: result.error,
    });
  } catch (error) {
    if (error instanceof SecurityError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({
      success: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
