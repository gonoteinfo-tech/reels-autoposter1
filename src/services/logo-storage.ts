import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const execFileAsync = promisify(execFile);

/** ID do administrador — dono da marca padrão (public/logos/logo.png) */
const ADMIN_USER_ID = 1;

/**
 * Logos enviadas pelas contas ficam em data/logos: fora do Git (um git pull não as
 * sobrescreve) e fora de public/ (o Next.js em produção só serve arquivos de public/
 * que existiam no build — uma logo enviada depois dava 404).
 */
const LOGOS_DIR = path.join(process.cwd(), 'data', 'logos');
const LEGACY_DIR = path.join(process.cwd(), 'public', 'logos');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const userLogoFile = (userId: number) => path.join(LOGOS_DIR, `logo_${userId}.png`);
/** Marcador de "sem marca d'água": vale mais que a logo antiga e que a logo padrão */
const noLogoMarker = (userId: number) => path.join(LOGOS_DIR, `logo_${userId}.none`);

/**
 * Logo que deve ir nos vídeos do usuário, ou null para publicar sem marca d'água.
 *
 * Ordem: logo enviada → logo antiga em public/logos (instalações anteriores) →
 * logo padrão, só para o administrador. Outras contas sem logo NÃO recebem a marca
 * do administrador.
 */
export function getUserLogoPath(userId: number): string | null {
  if (fs.existsSync(noLogoMarker(userId))) return null;

  const uploaded = userLogoFile(userId);
  if (fs.existsSync(uploaded)) return uploaded;

  const legacy = path.join(LEGACY_DIR, `logo_${userId}.png`);
  if (fs.existsSync(legacy)) return legacy;

  if (userId === ADMIN_USER_ID) {
    const adminDefault = path.join(LEGACY_DIR, 'logo.png');
    if (fs.existsSync(adminDefault)) return adminDefault;
  }

  return null;
}

/**
 * Salva a logo do usuário como PNG. JPEG e WebP são convertidos com o ffmpeg
 * (o processamento de vídeo espera um PNG de verdade).
 */
export async function saveUserLogo(userId: number, data: Buffer): Promise<void> {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });

  const target = userLogoFile(userId);
  const tmpOut = `${target}.${Date.now()}.tmp.png`;

  if (data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fs.writeFileSync(tmpOut, data);
  } else {
    const tmpIn = `${target}.${Date.now()}.upload`;
    fs.writeFileSync(tmpIn, data);
    try {
      await execFileAsync(ffmpegInstaller.path, ['-y', '-i', tmpIn, '-frames:v', '1', tmpOut], { timeout: 30000 });
    } catch {
      throw new Error('Não foi possível ler a imagem. Envie um PNG, JPEG ou WebP válido.');
    } finally {
      fs.rmSync(tmpIn, { force: true });
    }
  }

  // Troca atômica: o pipeline nunca lê um arquivo pela metade
  fs.renameSync(tmpOut, target);
  fs.rmSync(noLogoMarker(userId), { force: true });
}

/** Remove a logo do usuário: os próximos vídeos saem sem marca d'água */
export function removeUserLogo(userId: number): void {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
  fs.rmSync(userLogoFile(userId), { force: true });
  fs.writeFileSync(noLogoMarker(userId), '');
}
