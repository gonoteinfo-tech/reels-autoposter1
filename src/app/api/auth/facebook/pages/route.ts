import { NextResponse } from 'next/server';
import { clearCachedPages, getCachedPage, getCachedPages } from '@/services/oauth-cache';
import { getLoggedInUser } from '@/services/auth';
import { getAppSettings, updateSettings } from '@/services/database';
import { toPublicSettings } from '@/services/public-settings';
import { enforceUserRateLimit } from '@/services/rate-limit';
import { assertSameOrigin, SecurityError } from '@/services/security';
import type { FacebookPageOption } from '@/types';

function safePages(userId: number): FacebookPageOption[] {
  return getCachedPages(userId).map(({ id, name, instagram_business_account }) => ({
    id,
    name,
    instagram_business_account,
  }));
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof SecurityError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error('Erro ao configurar página do Facebook:', error);
  return NextResponse.json({ success: false, error: 'Erro interno do servidor.' }, { status: 500 });
}

export async function GET() {
  const user = await getLoggedInUser();
  if (!user) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
  return NextResponse.json({ success: true, data: { pages: safePages(user.id) } });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getLoggedInUser();
    if (!user) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
    enforceUserRateLimit(user.id, 'facebook-page', 10, 10 * 60 * 1000);

    const body = (await request.json()) as { pageId?: unknown };
    if (typeof body.pageId !== 'string' || !body.pageId) {
      return NextResponse.json({ success: false, error: 'Página inválida.' }, { status: 400 });
    }

    const page = getCachedPage(user.id, body.pageId);
    if (!page) {
      return NextResponse.json(
        { success: false, error: 'A autorização expirou. Conecte o Facebook novamente.' },
        { status: 410 }
      );
    }

    updateSettings(user.id, {
      facebook_page_access_token: page.access_token,
      facebook_page_id: page.id,
      facebook_page_name: page.name,
      instagram_business_account_id: page.instagram_business_account?.id ?? '',
      instagram_username: page.instagram_business_account?.username ?? '',
    });
    clearCachedPages(user.id);

    return NextResponse.json({ success: true, data: toPublicSettings(getAppSettings(user.id)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getLoggedInUser();
    if (!user) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });

    updateSettings(user.id, {
      facebook_page_access_token: '',
      facebook_page_id: '',
      facebook_page_name: '',
      instagram_business_account_id: '',
      instagram_username: '',
    });
    clearCachedPages(user.id);
    return NextResponse.json({ success: true, data: toPublicSettings(getAppSettings(user.id)) });
  } catch (error) {
    return errorResponse(error);
  }
}
