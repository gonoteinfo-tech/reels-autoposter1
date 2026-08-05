import { NextResponse } from 'next/server';
import cron from 'node-cron';
import { initDatabase, getAppSettings, updateSettings } from '@/services/database';
import { getLoggedInUser } from '@/services/auth';
import { toPublicSettings } from '@/services/public-settings';
import { assertSameOrigin, SecurityError } from '@/services/security';
import type { AppSettings } from '@/types';

type EditableSettingKey =
  | 'logo_position'
  | 'logo_scale'
  | 'cron_schedule'
  | 'max_reels_per_run'
  | 'discovery_limit'
  | 'discovery_interval_minutes'
  | 'publish_interval_minutes'
  | 'auto_publish'
  | 'custom_caption_template'
  | 'instagram_enabled'
  | 'facebook_enabled';

const VALID_SETTING_KEYS: Record<EditableSettingKey, 'string' | 'number' | 'boolean'> = {
  logo_position: 'string',
  logo_scale: 'number',
  cron_schedule: 'string',
  max_reels_per_run: 'number',
  discovery_limit: 'number',
  discovery_interval_minutes: 'number',
  publish_interval_minutes: 'number',
  auto_publish: 'boolean',
  custom_caption_template: 'string',
  instagram_enabled: 'boolean',
  facebook_enabled: 'boolean',
};

const VALID_LOGO_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];

function errorResponse(error: unknown): NextResponse {
  if (error instanceof SecurityError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error('Erro na API de configurações:', error);
  return NextResponse.json({ success: false, error: 'Erro interno do servidor.' }, { status: 500 });
}

export async function GET() {
  try {
    initDatabase();
    const user = await getLoggedInUser();
    if (!user) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
    return NextResponse.json({ success: true, data: toPublicSettings(getAppSettings(user.id)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    initDatabase();
    const user = await getLoggedInUser();
    if (!user) return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'O corpo deve ser um objeto JSON.' }, { status: 400 });
    }

    const validatedSettings: Partial<AppSettings> = {};
    const errors: string[] = [];

    for (const [key, value] of Object.entries(body)) {
      if (!(key in VALID_SETTING_KEYS)) {
        errors.push(`Chave desconhecida: "${key}"`);
        continue;
      }

      const settingKey = key as EditableSettingKey;
      const expectedType = VALID_SETTING_KEYS[settingKey];
      if (typeof value !== expectedType) {
        errors.push(`"${key}" deve ser do tipo ${expectedType}.`);
        continue;
      }

      if (settingKey === 'logo_position' && !VALID_LOGO_POSITIONS.includes(value as string)) {
        errors.push(`"logo_position" deve ser: ${VALID_LOGO_POSITIONS.join(', ')}.`);
        continue;
      }
      if (settingKey === 'logo_scale' && ((value as number) < 10 || (value as number) > 500)) {
        errors.push('"logo_scale" deve estar entre 10 e 500.');
        continue;
      }
      if ((settingKey === 'max_reels_per_run' || settingKey === 'discovery_limit') &&
          ((value as number) < 1 || (value as number) > 50)) {
        errors.push(`"${settingKey}" deve estar entre 1 e 50.`);
        continue;
      }
      if (settingKey === 'discovery_interval_minutes' &&
          ((value as number) < 5 || (value as number) > 1440)) {
        errors.push('"discovery_interval_minutes" deve estar entre 5 e 1440.');
        continue;
      }
      if (settingKey === 'publish_interval_minutes' &&
          ((value as number) < 0 || (value as number) > 1440)) {
        errors.push('"publish_interval_minutes" deve estar entre 0 e 1440.');
        continue;
      }
      if (settingKey === 'cron_schedule' && !cron.validate(value as string)) {
        errors.push('"cron_schedule" não é uma expressão cron válida.');
        continue;
      }

      Object.assign(validatedSettings, { [settingKey]: value });
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors.join(' ') }, { status: 400 });
    }
    if (Object.keys(validatedSettings).length === 0) {
      return NextResponse.json({ success: false, error: 'Nenhuma configuração válida.' }, { status: 400 });
    }

    updateSettings(user.id, validatedSettings);
    return NextResponse.json({ success: true, data: toPublicSettings(getAppSettings(user.id)) });
  } catch (error) {
    return errorResponse(error);
  }
}
