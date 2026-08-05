import { afterEach, describe, expect, it, vi } from 'vitest';
import { constantTimeEqual, getAppOrigin, SecurityError } from '../src/services/security';

const originalAppUrl = process.env.APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
  vi.unstubAllEnvs();
});

describe('segurança HTTP', () => {
  it('compara states OAuth sem aceitar valores diferentes', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true);
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false);
    expect(constantTimeEqual('curto', 'muito-maior')).toBe(false);
  });

  it('usa APP_URL como origem confiável', () => {
    process.env.APP_URL = 'https://reels.example.com/app/';
    expect(getAppOrigin(new Request('http://host-injetado.test/api')).origin).toBe('https://reels.example.com');
  });

  it('rejeita APP_URL sem HTTPS em produção', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.APP_URL = 'http://reels.example.com';
    expect(() => getAppOrigin(new Request('https://reels.example.com/api'))).toThrow(SecurityError);
  });
});
