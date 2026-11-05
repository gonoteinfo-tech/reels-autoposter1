import assert from 'node:assert/strict';
import test from 'node:test';
import * as captions from '../src/services/ai-caption';

test('publica somente a legenda reescrita quando há menos de seis hashtags relevantes', () => {
  const finalize = (captions as typeof captions & {
    finalizeRewrittenCaption?: (caption: string, hashtags: string[], sourceHashtags?: string) => string;
  }).finalizeRewrittenCaption;

  assert.equal(typeof finalize, 'function');

  const result = finalize!(
    'A prefeitura abriu nesta terça-feira um novo posto de atendimento no centro.',
    ['#Prefeitura', '#Atendimento'],
    '#Centro'
  );

  assert.equal(
    result,
    'A prefeitura abriu nesta terça-feira um novo posto de atendimento no centro.'
  );
});
