import { afterEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../src/services/secrets';

const originalKey = process.env.SETTINGS_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
  else process.env.SETTINGS_ENCRYPTION_KEY = originalKey;
});

describe('proteção de credenciais', () => {
  it('preserva o valor quando nenhuma chave foi configurada', () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    expect(encryptSecret('token-existente')).toBe('token-existente');
  });

  it('criptografa e recupera o mesmo valor sem expô-lo', () => {
    process.env.SETTINGS_ENCRYPTION_KEY = 'uma-chave-de-teste-com-entropia-suficiente';
    const encrypted = encryptSecret('token-existente');
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(encrypted).not.toContain('token-existente');
    expect(decryptSecret(encrypted)).toBe('token-existente');
  });

  it('não criptografa novamente um valor já protegido', () => {
    process.env.SETTINGS_ENCRYPTION_KEY = 'uma-chave-de-teste-com-entropia-suficiente';
    const encrypted = encryptSecret('token-existente');
    expect(encryptSecret(encrypted)).toBe(encrypted);
  });
});
