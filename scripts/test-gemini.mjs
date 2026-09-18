#!/usr/bin/env node
/**
 * Script de diagnóstico da reescrita de legendas com Gemini
 * Execute na VPS: node scripts/test-gemini.mjs "legenda de teste"
 */

import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

/**
 * Carrega variáveis de um arquivo .env para process.env, sem depender do pacote "dotenv".
 * Não sobrescreve variáveis já definidas no ambiente.
 */
function loadEnvFile(relativePath) {
  const filePath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

if (!apiKey) {
  console.error('❌ GEMINI_API_KEY não encontrada no .env!');
  console.error('   Gere uma chave em aistudio.google.com/apikey e adicione: GEMINI_API_KEY=...');
  process.exit(1);
}

console.log('✅ GEMINI_API_KEY encontrada:', apiKey.substring(0, 8) + '...');
console.log('   Modelo:', model);
console.log('');

const caption =
  process.argv[2] ||
  'Influenciadora cai ao tentar manobra de bicicleta em Parnamirim durante gravação de vídeo para as redes sociais';

console.log('📝 Legenda de teste:', caption);
console.log('');

try {
  const ai = new GoogleGenAI({ apiKey });
  const interaction = await ai.interactions.create({
    model,
    system_instruction:
      'Reescreva a legenda com suas próprias palavras em tom jornalístico e gere de 8 a 12 hashtags sobre o assunto. Responda em JSON.',
    input: caption,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: {
        type: 'object',
        properties: {
          legenda: { type: 'string' },
          hashtags: { type: 'array', items: { type: 'string' } },
        },
        required: ['legenda', 'hashtags'],
      },
    },
  });

  const parsed = JSON.parse(interaction.output_text || '{}');
  console.log('✅ Gemini respondeu!');
  console.log('');
  console.log('Legenda reescrita:', parsed.legenda);
  console.log('Hashtags:', (parsed.hashtags || []).join(' '));
  console.log('');
  console.log('🏁 Diagnóstico concluído!');
} catch (err) {
  console.error('❌ Erro ao chamar o Gemini:', err?.message || err);
  console.error('   Detalhes:', JSON.stringify(err?.body ?? err?.error ?? {}, null, 2));
  process.exit(1);
}
