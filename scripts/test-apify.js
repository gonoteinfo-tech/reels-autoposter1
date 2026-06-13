#!/usr/bin/env node
/**
 * Script de diagnóstico da integração Apify
 * Execute na VPS: node scripts/test-apify.js
 */

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const token = process.env.APIFY_TOKEN;

if (!token) {
  console.error('❌ APIFY_TOKEN não encontrado no .env!');
  console.error('   Certifique-se de que o .env contém: APIFY_TOKEN=apify_api_...');
  process.exit(1);
}

console.log('✅ APIFY_TOKEN encontrado:', token.substring(0, 12) + '...');
console.log('');

async function run() {
  const { ApifyClient } = await import('apify-client');
  const client = new ApifyClient({ token });

  // 1. Testar autenticação
  console.log('🔑 Testando autenticação...');
  try {
    const me = await client.user('me').get();
    console.log('✅ Autenticação OK! Usuário:', me?.username || me?.id);
    console.log('   Plano:', me?.plan?.id || 'desconhecido');
    console.log('');
  } catch (err) {
    console.error('❌ Falha na autenticação:', err.message);
    console.error('   Verifique se o token está correto em apify.com/account/integrations');
    process.exit(1);
  }

  // 2. Testar com URL de reel direta usando apify/instagram-scraper (actor principal)
  const testReelUrl = 'https://www.instagram.com/reel/DZgbZtyIE3y/';
  console.log('🤖 Testando download de reel individual...');
  console.log('   URL:', testReelUrl);
  console.log('   Actor: apify/instagram-scraper');
  console.log('   (Aguarde até 2 minutos...)');
  console.log('');

  try {
    const run = await client.actor('apify/instagram-scraper').call(
      {
        directUrls: [testReelUrl],
        resultsType: 'posts',
        resultsLimit: 1,
      },
      { timeout: 120, memory: 256 }
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    if (!items || items.length === 0) {
      console.warn('⚠️  Actor retornou 0 resultados');
    } else {
      const item = items[0];
      console.log('✅ Reel encontrado!');
      console.log('   ID:', item.shortCode || item.id);
      console.log('   VideoUrl:', item.videoUrl ? '✅ PRESENTE' : '❌ AUSENTE');
      console.log('   VideoPlaybackUrl:', item.videoPlaybackUrl ? '✅ PRESENTE' : '❌ AUSENTE');
      console.log('   DisplayUrl:', item.displayUrl ? '✅ PRESENTE' : '❌ AUSENTE');
      console.log('   Caption:', (item.caption || '').substring(0, 80));
      console.log('');
      console.log('📋 Campos disponíveis no item:');
      console.log('  ', Object.keys(item).filter(k => !['__typename'].includes(k)).join(', '));
      
      const videoUrl = item.videoUrl || item.videoPlaybackUrl || item.displayUrl;
      if (videoUrl) {
        console.log('');
        console.log('✅ URL DO VÍDEO:', videoUrl.substring(0, 100) + '...');
      } else {
        console.error('❌ Nenhuma URL de vídeo encontrada nos campos!');
      }
    }
  } catch (err) {
    console.error('❌ Erro ao executar actor:', err.message);
    
    if (err.message.includes('not found') || err.message.includes('does not exist')) {
      console.log('');
      console.log('💡 O actor "apify/instagram-scraper" não foi encontrado.');
      console.log('   Tentando listar actors alternativos disponíveis...');
      
      // Tentar actors alternativos
      const alternatives = [
        'apify/instagram-reel-scraper',
        'apify/instagram-post-scraper',
        'clockworks/instagram-scraper',
      ];
      
      for (const alt of alternatives) {
        try {
          console.log(`   Testando: ${alt}`);
          const info = await client.actor(alt).get();
          if (info) {
            console.log(`   ✅ Actor "${alt}" existe! Use este nome.`);
          }
        } catch (e) {
          console.log(`   ❌ Actor "${alt}" não encontrado`);
        }
      }
    }
  }
  
  console.log('');
  console.log('🏁 Diagnóstico concluído!');
}

run().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
