#!/usr/bin/env node
/**
 * Script de diagnóstico da integração Bright Data
 * Execute na VPS: node scripts/test-brightdata.js [url-do-reel]
 */

const fs = require('fs');
const path = require('path');

/**
 * Carrega variáveis de um arquivo .env para process.env, sem depender do pacote "dotenv".
 * Não sobrescreve variáveis já definidas no ambiente.
 */
function loadEnvFile(relativePath) {
  const filePath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    // Ignorar linhas vazias e comentários
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    // Remover aspas envolventes, se houver
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// .env.local tem prioridade sobre .env (carregado primeiro, não sobrescreve)
loadEnvFile('.env.local');
loadEnvFile('.env');

const token = process.env.BRIGHTDATA_API_TOKEN || process.env.BRIGHTDATA_TOKEN;
const dataset = process.env.BRIGHTDATA_REELS_DATASET || 'gd_lyclm20il4r5helnj';
const API = 'https://api.brightdata.com';

if (!token) {
  console.error('❌ BRIGHTDATA_API_TOKEN não encontrado no .env!');
  console.error('   Certifique-se de que o .env contém: BRIGHTDATA_API_TOKEN=...');
  process.exit(1);
}

console.log('✅ BRIGHTDATA_API_TOKEN encontrado:', token.substring(0, 12) + '...');
console.log('   Dataset de reels:', dataset);
console.log('');

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  // 1. Testar autenticação (sonda barata, não consome crédito de coleta)
  console.log('🔑 Testando autenticação...');
  const probe = await fetch(`${API}/datasets/v3/progress/s_connection_probe`, { headers });

  if (probe.status === 401 || probe.status === 403) {
    console.error('❌ Falha na autenticação (HTTP ' + probe.status + ')');
    console.error('   Gere/valide o token em brightdata.com/cp/setting/users');
    process.exit(1);
  }
  console.log('✅ Autenticação OK! (HTTP ' + probe.status + ' na sonda — token aceito)');
  console.log('');

  // 2. Coletar um reel individual
  const testReelUrl = process.argv[2] || 'https://www.instagram.com/reel/DZgbZtyIE3y/';
  console.log('🌐 Testando coleta de reel individual...');
  console.log('   URL:', testReelUrl);
  console.log('   (Aguarde até 3 minutos...)');
  console.log('');

  const triggerRes = await fetch(
    `${API}/datasets/v3/trigger?dataset_id=${dataset}&include_errors=true`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify([{ url: testReelUrl }]),
    }
  );

  if (!triggerRes.ok) {
    console.error(`❌ Erro ao disparar a coleta (HTTP ${triggerRes.status}):`, await triggerRes.text());
    process.exit(1);
  }

  const { snapshot_id: snapshotId } = await triggerRes.json();
  if (!snapshotId) {
    console.error('❌ A Bright Data não retornou snapshot_id');
    process.exit(1);
  }
  console.log('   Snapshot:', snapshotId);

  // 3. Aguardar o snapshot ficar pronto
  const deadline = Date.now() + 180000;
  let status = 'starting';

  while (Date.now() < deadline) {
    await sleep(5000);
    const progressRes = await fetch(`${API}/datasets/v3/progress/${snapshotId}`, { headers });
    const progress = await progressRes.json();
    status = progress.status;
    process.stdout.write(`   Status: ${status}          \r`);
    if (status === 'ready' || status === 'failed' || status === 'canceled') break;
  }
  console.log('');

  if (status !== 'ready') {
    console.error(`❌ Coleta não concluída (status: ${status})`);
    process.exit(1);
  }

  const snapshotRes = await fetch(`${API}/datasets/v3/snapshot/${snapshotId}?format=json`, { headers });
  const items = await snapshotRes.json();

  if (!Array.isArray(items) || items.length === 0) {
    console.warn('⚠️  A coleta retornou 0 resultados');
    process.exit(0);
  }

  const item = items[0];

  if (item.error) {
    console.error('❌ A Bright Data retornou um erro para essa URL:', item.error);
    process.exit(1);
  }

  console.log('✅ Reel encontrado!');
  console.log('   ID:', item.shortcode || item.post_id || item.content_id);
  console.log('   video_url:', item.video_url ? '✅ PRESENTE' : '❌ AUSENTE');
  console.log('   thumbnail:', item.thumbnail ? '✅ PRESENTE' : '❌ AUSENTE');
  console.log('   Autor:', item.user_posted);
  console.log('   Legenda:', (item.description || '').substring(0, 80));
  console.log('');
  console.log('📋 Campos disponíveis no item:');
  console.log('  ', Object.keys(item).join(', '));

  if (item.video_url) {
    console.log('');
    console.log('✅ URL DO VÍDEO:', item.video_url.substring(0, 100) + '...');
  } else {
    console.error('❌ Nenhuma URL de vídeo encontrada nos campos!');
  }

  console.log('');
  console.log('🏁 Diagnóstico concluído!');
}

run().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
