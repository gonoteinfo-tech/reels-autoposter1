#!/usr/bin/env node
/**
 * Limpeza de vídeos locais na VPS.
 *
 * Apaga:
 *   1. Os arquivos (original + processado) de reels JÁ PUBLICADOS — a publicação usa a cópia no R2.
 *   2. Arquivos órfãos em data/downloads e data/processed que nenhum reel pendente usa
 *      (sobras de tentativas com erro, reprocessamentos, downloads parciais .part).
 *
 * Nunca apaga arquivos de reels ainda na fila, nem arquivos modificados nas últimas 2 horas
 * (podem ser um download em andamento).
 *
 * Uso (na pasta do projeto):
 *   node scripts/cleanup-videos.js           → só mostra o que seria apagado (nada é apagado)
 *   node scripts/cleanup-videos.js --apply   → apaga de verdade
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const RECENT_MS = 2 * 60 * 60 * 1000;

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'reels.db');
const videoDirs = [path.join(dataDir, 'downloads'), path.join(dataDir, 'processed')];

if (!fs.existsSync(dbPath)) {
  console.error(`❌ Banco não encontrado em ${dbPath}. Rode o script na pasta do projeto.`);
  process.exit(1);
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const gb = (bytes) => `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;

/** Tamanho do arquivo, ou 0 se não existir */
function sizeOf(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * Caminho canônico para comparação: resolve links simbólicos e formas diferentes do
 * mesmo caminho. Se o arquivo não existir, usa o caminho absoluto.
 */
function canonical(filePath) {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

const db = new Database(dbPath);

// ── 1. Reels publicados com arquivos locais ──
const published = db.prepare(`
  SELECT id, local_path, processed_path FROM reels
  WHERE stage = 'published' AND (local_path IS NOT NULL OR processed_path IS NOT NULL)
`).all();


// ── 2. Órfãos: arquivos nas pastas de vídeo que nenhum reel não publicado referencia ──
// Por segurança, um arquivo é mantido se o caminho OU o nome dele aparecer num reel pendente.
const keep = new Set();
const keepNames = new Set();
const pending = db.prepare(`
  SELECT local_path, processed_path FROM reels WHERE stage != 'published'
`).all();
for (const reel of pending) {
  for (const filePath of [reel.local_path, reel.processed_path]) {
    if (!filePath) continue;
    keep.add(canonical(filePath));
    keepNames.add(path.basename(filePath));
  }
}

// Arquivos de reels publicados — exceto os que outro reel ainda pendente também usa
// (dois usuários com a mesma fonte compartilham o mesmo arquivo original)
const publishedFiles = [];
let sharedKept = 0;
for (const reel of published) {
  for (const filePath of [reel.local_path, reel.processed_path]) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    const resolved = canonical(filePath);
    if (keep.has(resolved) || keepNames.has(path.basename(filePath))) {
      sharedKept++;
      continue;
    }
    if (!publishedFiles.includes(resolved)) publishedFiles.push(resolved);
  }
}

const publishedSet = new Set(publishedFiles);
const orphanFiles = [];
let skippedRecent = 0;

for (const dir of videoDirs) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    const filePath = canonical(path.join(dir, name));
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile() || keep.has(filePath) || keepNames.has(name) || publishedSet.has(filePath)) continue;
    if (Date.now() - stat.mtimeMs < RECENT_MS) {
      skippedRecent++;
      continue;
    }
    orphanFiles.push(filePath);
  }
}

// ── Relatório ──
const publishedBytes = publishedFiles.reduce((sum, f) => sum + sizeOf(f), 0);
const orphanBytes = orphanFiles.reduce((sum, f) => sum + sizeOf(f), 0);
const keptBytes = [...keep].reduce((sum, f) => sum + sizeOf(f), 0);

console.log('🧹 Limpeza de vídeos locais');
console.log('');
console.log(`   Reels publicados com arquivos: ${published.length} (${publishedFiles.length} arquivos, ${gb(publishedBytes)})`);
console.log(`   Arquivos órfãos:               ${orphanFiles.length} (${gb(orphanBytes)})`);
console.log(`   Mantidos (reels na fila/erro): ${keep.size} arquivos (${gb(keptBytes)})`);
if (sharedKept > 0) {
  console.log(`   Mantidos por serem compartilhados com reel na fila: ${sharedKept}`);
}
if (skippedRecent > 0) {
  console.log(`   Ignorados por serem recentes:  ${skippedRecent} (podem ser downloads em andamento)`);
}
console.log('');
console.log(`   Total a liberar: ${gb(publishedBytes + orphanBytes)}`);
console.log('');

if (!APPLY) {
  const sample = [...publishedFiles, ...orphanFiles].slice(0, 10);
  if (sample.length > 0) {
    console.log('   Exemplos do que seria apagado:');
    for (const f of sample) console.log(`     - ${path.relative(process.cwd(), f)} (${mb(sizeOf(f))})`);
    console.log('');
  }
  console.log('ℹ️  Nada foi apagado. Para apagar de verdade, rode:');
  console.log('   node scripts/cleanup-videos.js --apply');
  process.exit(0);
}

// ── Apagar ──
let freed = 0;
let failed = 0;
for (const filePath of [...publishedFiles, ...orphanFiles]) {
  const size = sizeOf(filePath);
  try {
    fs.unlinkSync(filePath);
    freed += size;
  } catch (err) {
    failed++;
    console.warn(`⚠️  Não foi possível apagar ${filePath}: ${err.message}`);
  }
}

// Limpar as referências dos reels publicados (os arquivos não existem mais)
const cleared = db.prepare(`
  UPDATE reels SET local_path = NULL, processed_path = NULL
  WHERE stage = 'published' AND (local_path IS NOT NULL OR processed_path IS NOT NULL)
`).run();

db.close();

console.log(`✅ ${gb(freed)} liberados. ${cleared.changes} reels publicados atualizados no banco.`);
if (failed > 0) console.log(`⚠️  ${failed} arquivos não puderam ser apagados (veja acima).`);
