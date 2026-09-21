import { NextResponse } from 'next/server';
import { getLoggedInUser } from '@/services/auth';
import { saveUserLogo } from '@/services/logo-storage';
import type { ApiResponse } from '@/types';

/** Tipos MIME permitidos para o logo */
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Tamanho máximo do arquivo: 5MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * POST /api/upload-logo
 * Faz upload de um arquivo de logo específico para o usuário autenticado.
 */
export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    const user = await getLoggedInUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Não autorizado. Faça login primeiro.' },
        { status: 401 }
      );
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { success: false, error: 'Content-Type deve ser multipart/form-data' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('logo') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'O campo "logo" é obrigatório. Envie um arquivo de imagem.' },
        { status: 400 }
      );
    }

    // Validar tipo do arquivo
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Tipo de arquivo não suportado: ${file.type}. Use PNG, JPEG ou WebP.`,
        },
        { status: 400 }
      );
    }

    // Validar tamanho do arquivo
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo permitido: 5MB.`,
        },
        { status: 400 }
      );
    }

    // Salva em data/logos (fora do Git e de public/), convertendo para PNG se preciso
    const buffer = Buffer.from(await file.arrayBuffer());
    await saveUserLogo(user.id, buffer);
    console.log(`🎨 Logo salva para o Usuário ${user.id} (${(file.size / 1024).toFixed(1)}KB)`);

    return NextResponse.json({
      success: true,
      data: { path: `/api/logo?t=${Date.now()}` },
    });
  } catch (error) {
    console.error('❌ Erro ao fazer upload do logo:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
