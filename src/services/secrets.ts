import 'server-only';

import crypto from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';

function getEncryptionKey(): Buffer | null {
  const configuredKey = process.env.SETTINGS_ENCRYPTION_KEY?.trim();
  if (!configuredKey) return null;
  return crypto.createHash('sha256').update(configuredKey, 'utf8').digest();
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Criptografa valores sensíveis com AES-256-GCM quando SETTINGS_ENCRYPTION_KEY
 * está configurada. Sem a chave, mantém o valor atual para não interromper as
 * credenciais existentes; a configuração de produção documenta a chave como
 * obrigatória.
 */
export function encryptSecret(value: string): string {
  if (!value || isEncryptedSecret(value)) return value;
  const key = getEncryptionKey();
  if (!key) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string): string {
  if (!value || !isEncryptedSecret(value)) return value;
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('SETTINGS_ENCRYPTION_KEY é necessária para ler as credenciais armazenadas');
  }

  const [ivEncoded, tagEncoded, payloadEncoded] = value.slice(ENCRYPTED_PREFIX.length).split(':');
  if (!ivEncoded || !tagEncoded || !payloadEncoded) {
    throw new Error('Credencial criptografada possui formato inválido');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadEncoded, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export const SENSITIVE_SETTING_KEYS = new Set(['facebook_page_access_token']);

export function serializeSetting(key: string, value: unknown): string {
  const serialized = String(value);
  return SENSITIVE_SETTING_KEYS.has(key) ? encryptSecret(serialized) : serialized;
}

export function deserializeSetting(key: string, value: string): string {
  return SENSITIVE_SETTING_KEYS.has(key) ? decryptSecret(value) : value;
}
