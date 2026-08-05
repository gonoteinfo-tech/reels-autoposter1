import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getLoggedInUser } from '@/services/auth';
import { enforceUserRateLimit } from '@/services/rate-limit';
import { SecurityError } from '@/services/security';
import type { ApiResponse } from '@/types';

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    const user = await getLoggedInUser();
    if (!user) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
    enforceUserRateLimit(user.id, 'logo-upload', 10, 60 * 60 * 1000);

    if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) {
      return NextResponse.json({ success: false, error: 'Content-Type deve ser multipart/form-data.' }, { status: 400 });
    }

    const file = (await request.formData()).get('logo');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Envie um arquivo no campo "logo".' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'Use uma imagem PNG, JPEG ou WebP de até 5 MB.' }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { failOn: 'error', limitInputPixels: 40_000_000, animated: false });
    const metadata = await image.metadata();
    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format) || !metadata.width || !metadata.height) {
      return NextResponse.json({ success: false, error: 'O conteúdo do arquivo não é uma imagem válida.' }, { status: 400 });
    }

    const output = await image
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const logosDir = path.join(process.cwd(), 'public', 'logos');
    await fs.mkdir(logosDir, { recursive: true });
    const filename = `logo_${user.id}.png`;
    await fs.writeFile(path.join(logosDir, filename), output, { flag: 'w' });

    return NextResponse.json({ success: true, data: { path: `/logos/${filename}` } });
  } catch (error) {
    if (error instanceof SecurityError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Erro ao fazer upload do logo:', error);
    return NextResponse.json({ success: false, error: 'Não foi possível processar a imagem.' }, { status: 400 });
  }
}
