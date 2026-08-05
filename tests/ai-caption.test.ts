import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createCompletionMock } = vi.hoisted(() => ({
  createCompletionMock: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: createCompletionMock,
      },
    };
  },
}));

import { rewriteCaption } from '../src/services/ai-caption';

const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'chave-de-teste';
  process.env.OPENAI_MODEL = 'modelo-de-teste';
  createCompletionMock.mockReset();
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;

  if (originalModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = originalModel;
});

describe('reescrita jornalística de legendas', () => {
  it('não chama a API quando a legenda está vazia', async () => {
    await expect(rewriteCaption('   ')).resolves.toBe('   ');
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it('envia regras editoriais contra sensacionalismo e preservação dos fatos', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: 'Legenda jornalística final. #informação' } }],
    });

    await expect(rewriteCaption('Prefeitura anunciou a nova medida.')).resolves.toBe(
      'Legenda jornalística final. #informação'
    );

    expect(createCompletionMock).toHaveBeenCalledOnce();
    const request = createCompletionMock.mock.calls[0][0];
    const systemPrompt = request.messages[0].content as string;
    const userPrompt = request.messages[1].content as string;

    expect(request.model).toBe('modelo-de-teste');
    expect(request.temperature).toBe(0.4);
    expect(systemPrompt).toContain('Não invente informações');
    expect(systemPrompt).toContain('Não use sensacionalismo, clickbait');
    expect(systemPrompt).toContain('Não transforme opinião, hipótese ou rumor em fato');
    expect(systemPrompt).toContain('Não inclua chamada para compartilhar');
    expect(userPrompt).toContain('<legenda_original>');
    expect(userPrompt).toContain('Prefeitura anunciou a nova medida.');
  });
});
