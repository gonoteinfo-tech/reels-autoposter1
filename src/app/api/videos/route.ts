import { NextResponse } from 'next/server';
import fs from 'fs';
import { Readable } from 'stream';
import { getLoggedInUser } from '@/services/auth';
import { getReelById } from '@/services/database';

const VIDEO_HEADERS = {
  'Accept-Ranges': 'bytes',
  'Cache-Control': 'private, no-store',
  'Content-Disposition': 'inline',
  'Content-Type': 'video/mp4',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request: Request) {
  try {
    const user = await getLoggedInUser();
    if (!user) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get('id');
    const id = rawId ? Number(rawId) : Number.NaN;
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'ID do reel inválido.' }, { status: 400 });
    }

    const reel = getReelById(id, user.id);
    if (!reel) return NextResponse.json({ success: false, error: 'Reel não encontrado.' }, { status: 404 });

    const type = searchParams.get('type');
    const filePath = type === 'processed'
      ? reel.processed_path
      : type === 'local'
        ? reel.local_path
        : reel.processed_path || reel.local_path;

    if (!filePath || !fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'Arquivo de vídeo não encontrado.' }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return NextResponse.json({ success: false, error: 'Vídeo inválido.' }, { status: 404 });

    const range = request.headers.get('range');
    if (!range) {
      const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;
      return new NextResponse(stream, {
        headers: { ...VIDEO_HEADERS, 'Content-Length': String(stat.size) },
      });
    }

    const match = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
    if (!match) {
      return new NextResponse('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${stat.size}` },
      });
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= stat.size) {
      return new NextResponse('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${stat.size}` },
      });
    }

    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        ...VIDEO_HEADERS,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': String(end - start + 1),
      },
    });
  } catch (error) {
    console.error('Erro ao servir stream de vídeo:', error);
    return NextResponse.json({ success: false, error: 'Erro interno ao servir o vídeo.' }, { status: 500 });
  }
}
