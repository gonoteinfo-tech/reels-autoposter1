import { NextResponse } from 'next/server';
import fs from 'fs';
import { getLoggedInUser } from '@/services/auth';
import { getUserLogoPath, removeUserLogo } from '@/services/logo-storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/logo
 * Devolve a marca d'água atual do usuário logado (a mesma que vai nos vídeos),
 * ou 404 se ele publica sem marca d'água. Sem cache: a troca aparece na hora.
 */
export async function GET() {
  const user = await getLoggedInUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
  }

  const logoPath = getUserLogoPath(user.id);
  if (!logoPath) {
    return NextResponse.json({ success: false, error: 'Sem marca d\'água' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(fs.readFileSync(logoPath)), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * DELETE /api/logo
 * Remove a marca d'água: os próximos vídeos saem sem logo.
 */
export async function DELETE() {
  const user = await getLoggedInUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
  }

  removeUserLogo(user.id);
  console.log(`🎨 Marca d'água removida pelo Usuário ${user.id}`);
  return NextResponse.json({ success: true });
}
