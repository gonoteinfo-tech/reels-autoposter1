import path from 'path';
import fs from 'fs';
import type { PipelineResult, ReelStage, User } from '@/types';
import {
  initDatabase,
  getActiveSources,
  getReelByUrl,
  createReel,
  updateReelStage,
  updateReel,
  updateSourceLastChecked,
  getReelsByStage,
  getReelById,
  getAppSettings,
  getAllUsers,
  getUserById,
} from './database';
import { discoverReels, downloadReel, downloadFromDirectUrl, extractVideoId, randomSleep } from './instagram-downloader';
import { discoverReelsApify, fetchSingleReelApify, isApifyConfigured } from './apify-discoverer';
import { addLogoToVideo } from './video-processor';
import { uploadVideo, generateR2Key } from './storage';
import { publishReel as publishToInstagram } from './instagram-publisher';
import { publishReelToPage } from './facebook-publisher';
import { rewriteCaption } from './ai-caption';

/** Diretórios de trabalho do pipeline */
const DOWNLOADS_DIR = path.join(process.cwd(), 'data', 'downloads');
const PROCESSED_DIR = path.join(process.cwd(), 'data', 'processed');

/**
 * Garante que os diretórios de trabalho existem.
 */
function ensureDirectories(): void {
  for (const dir of [DOWNLOADS_DIR, PROCESSED_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Mede o tempo de execução de uma etapa e retorna um PipelineResult.
 */
async function measureStage(
  reelId: number,
  stage: ReelStage,
  fn: () => Promise<string>
): Promise<PipelineResult> {
  const start = Date.now();
  try {
    const message = await fn();
    return {
      reel_id: reelId,
      stage,
      success: true,
      message,
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      reel_id: reelId,
      stage,
      success: false,
      message: errorMsg,
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Processa um reel individual por todas as etapas do pipeline.
 * Cada etapa atualiza o estágio no banco de dados.
 *
 * Pipeline: download → process (add logo) → upload to R2 → publish to IG + FB
 *
 * @param reelId ID do reel no banco de dados
 * @returns Array de resultados para cada etapa executada
 */
export async function processReel(reelId: number): Promise<PipelineResult[]> {
  console.log(`\n🔄 ===== Processando Reel #${reelId} =====`);
  const results: PipelineResult[] = [];

  ensureDirectories();

  let reel = getReelById(reelId);
  if (!reel) {
    const result: PipelineResult = {
      reel_id: reelId,
      stage: 'error',
      success: false,
      message: `Reel #${reelId} não encontrado no banco de dados`,
      duration_ms: 0,
    };
    results.push(result);
    return results;
  }

  // Carregar as configurações específicas do usuário dono do Reel
  const settings = getAppSettings(reel.user_id);

  // ── Etapa 1: Download ──
  if (reel.stage === 'discovered' || reel.stage === 'downloading') {
    const downloadResult = await measureStage(reelId, 'downloading', async () => {
      updateReelStage(reelId, 'downloading');

      let filePath: string;
      let metadata: { title?: string; description?: string; duration?: number };

      // 1ª tentativa: URL direta da Apify (descoberta automática de perfil)
      let directUrl = (reel as any).direct_video_url as string | undefined;

      // 2ª tentativa: buscar URL direta via Apify para reels adicionados manualmente
      const isInstagramUrl = reel!.instagram_url.includes('instagram.com');
      if (!directUrl && isInstagramUrl && isApifyConfigured()) {
        console.log(`🤖 [Apify] Buscando URL direta para reel #${reelId} adicionado manualmente...`);
        try {
          const apifyInfo = await fetchSingleReelApify(reel!.instagram_url);
          if (apifyInfo?.videoUrl) {
            directUrl = apifyInfo.videoUrl;
            // Atualizar caption e hashtags se vieram da Apify e o reel não tinha
            if (!reel!.caption && apifyInfo.caption) {
              updateReel(reelId, {
                caption: apifyInfo.caption,
                hashtags: apifyInfo.hashtags.join(' '),
                original_caption: apifyInfo.caption,
              });
              reel = getReelById(reelId)!;
            }
            console.log(`🤖 [Apify] URL direta obtida com sucesso para reel #${reelId}`);
          }
        } catch (apifyErr) {
          const apifyMsg = apifyErr instanceof Error ? apifyErr.message : String(apifyErr);
          console.warn(`⚠️ [Apify] Falha ao buscar URL direta: ${apifyMsg}. Usando fallback yt-dlp.`);
        }
      }

      if (directUrl) {
        // Download por URL direta — sem cookies, sem bloqueio de VPS
        const reelIdForFile = reel!.instagram_id || String(reelId);
        filePath = await downloadFromDirectUrl(directUrl, DOWNLOADS_DIR, reelIdForFile);
        metadata = { title: '', description: reel!.caption || '', duration: 0 };
      } else {
        // 3ª tentativa (fallback): yt-dlp com cookies (TikTok, YouTube, Facebook)
        console.log(`⚠️ Reel #${reelId}: usando yt-dlp com cookies (fallback)`);
        const result = await downloadReel(reel!.instagram_url, DOWNLOADS_DIR);
        filePath = result.filePath;
        metadata = result.metadata;
      }

      const originalCaption = metadata.description || metadata.title || reel!.caption || '';
      
      // Reescrever a legenda original se nenhuma legenda customizada existir
      let finalCaption = reel!.caption;
      if (!finalCaption) {
        finalCaption = await rewriteCaption(originalCaption);
      }

      updateReel(reelId, {
        local_path: filePath,
        duration_seconds: metadata.duration || 0,
        original_caption: originalCaption,
        caption: finalCaption,
        stage: 'downloaded',
      });

      return `Download concluído: ${path.basename(filePath)} (${metadata.duration || 0}s)`;
    });

    results.push(downloadResult);

    if (!downloadResult.success) {
      updateReelStage(reelId, 'error', downloadResult.message);
      console.log(`❌ Reel #${reelId} falhou no download: ${downloadResult.message}`);
      return results;
    }

    // Recarregar reel atualizado
    reel = getReelById(reelId)!;
  }

  // ── Etapa 2: Processamento (adicionar logo) ──
  if (reel.stage === 'downloaded' || reel.stage === 'processing') {
    const processResult = await measureStage(reelId, 'processing', async () => {
      updateReelStage(reelId, 'processing');

      const outputFilename = `processed_${reelId}_${Date.now()}.mp4`;
      const outputPath = path.join(PROCESSED_DIR, outputFilename);

      // Caminhos do logo: específico do usuário ou admin fallback
      const userLogoPath = path.join(process.cwd(), 'public', 'logos', `logo_${reel!.user_id}.png`);
      const adminLogoPath = path.join(process.cwd(), 'public', 'logos', 'logo.png');
      const activeLogoPath = fs.existsSync(userLogoPath) ? userLogoPath : adminLogoPath;

      // Verificar se o logo ativo existe
      if (fs.existsSync(activeLogoPath)) {
        await addLogoToVideo(
          reel!.local_path!,
          activeLogoPath,
          outputPath,
          settings.logo_position,
          settings.logo_scale
        );
      } else {
        console.log('🎬 Logo não encontrada, copiando vídeo sem processamento');
        fs.copyFileSync(reel!.local_path!, outputPath);
      }

      updateReel(reelId, {
        processed_path: outputPath,
        stage: 'processed',
      });

      return `Processamento concluído: ${outputFilename}`;
    });

    results.push(processResult);

    if (!processResult.success) {
      updateReelStage(reelId, 'error', processResult.message);
      console.log(`❌ Reel #${reelId} falhou no processamento: ${processResult.message}`);
      return results;
    }

    reel = getReelById(reelId)!;
  }

  // ── Etapa 3: Upload para R2 ──
  if (reel.stage === 'processed' || reel.stage === 'uploading') {
    const uploadResult = await measureStage(reelId, 'uploading', async () => {
      updateReelStage(reelId, 'uploading');

      const r2Key = generateR2Key(reelId, reel!.source_username);
      const r2Url = await uploadVideo(reel!.processed_path!, r2Key);

      updateReel(reelId, {
        r2_url: r2Url,
        stage: 'uploaded',
      });

      return `Upload concluído: ${r2Url}`;
    });

    results.push(uploadResult);

    if (!uploadResult.success) {
      updateReelStage(reelId, 'error', uploadResult.message);
      console.log(`❌ Reel #${reelId} falhou no upload: ${uploadResult.message}`);
      return results;
    }

    reel = getReelById(reelId)!;
  }

  // ── Etapa 4: Publicação no Instagram + Facebook ──
  if (reel.stage === 'uploaded' || reel.stage === 'publishing') {
    // Verificar limite do plano gratuito
    const user = getUserById(reel.user_id);
    if (user && user.plan === 'free') {
      const { getPublishedTotalCount } = require('./database');
      const publishedCount = getPublishedTotalCount(reel.user_id);
      if (publishedCount >= 1) {
        const errorMsg = "Limite do plano gratuito atingido (máximo 1 publicação). Por favor, atualize seu plano.";
        updateReelStage(reelId, 'error', errorMsg);
        console.log(`❌ [Plano Grátis] Reel #${reelId} bloqueado: ${errorMsg}`);
        return [
          {
            reel_id: reelId,
            stage: 'publishing',
            success: false,
            message: errorMsg,
            duration_ms: 0,
          }
        ];
      }
    }

    const publishResult = await measureStage(reelId, 'publishing', async () => {
      updateReelStage(reelId, 'publishing');

      const caption = buildCaption(reel!.caption, reel!.hashtags, settings.custom_caption_template);
      const publishMessages: string[] = [];

      // Publicar no Instagram (usando credenciais do usuário)
      if (settings.instagram_enabled) {
        try {
          const { mediaId } = await publishToInstagram(
            reel!.r2_url!,
            caption,
            settings.facebook_page_access_token,
            settings.instagram_business_account_id
          );
          updateReel(reelId, { ig_post_id: mediaId });
          publishMessages.push(`IG: ${mediaId}`);
        } catch (igError) {
          const igMsg = igError instanceof Error ? igError.message : String(igError);
          console.error(`❌ Falha na publicação IG do Reel #${reelId}: ${igMsg}`);
          publishMessages.push(`IG: FALHA - ${igMsg}`);
        }
      }

      // Publicar no Facebook (usando credenciais do usuário)
      if (settings.facebook_enabled) {
        try {
          const fbPostId = await publishReelToPage(
            reel!.r2_url!,
            caption,
            settings.facebook_page_access_token,
            settings.facebook_page_id
          );
          updateReel(reelId, { fb_post_id: fbPostId });
          publishMessages.push(`FB: ${fbPostId}`);
        } catch (fbError) {
          const fbMsg = fbError instanceof Error ? fbError.message : String(fbError);
          console.error(`❌ Falha na publicação FB do Reel #${reelId}: ${fbMsg}`);
          publishMessages.push(`FB: FALHA - ${fbMsg}`);
        }
      }

      // Verificar se pelo menos uma publicação teve sucesso
      const reelUpdated = getReelById(reelId)!;
      if (reelUpdated.ig_post_id || reelUpdated.fb_post_id) {
        updateReel(reelId, {
          stage: 'published',
          published_at: new Date().toISOString(),
        });
        return `Publicação concluída: ${publishMessages.join(' | ')}`;
      } else {
        throw new Error(`Nenhuma plataforma publicou com sucesso: ${publishMessages.join(' | ')}`);
      }
    });

    results.push(publishResult);

    if (!publishResult.success) {
      updateReelStage(reelId, 'error', publishResult.message);
      console.log(`❌ Reel #${reelId} falhou na publicação: ${publishResult.message}`);
      return results;
    }
  }

  console.log(`✅ Reel #${reelId} processado com sucesso!`);
  return results;
}

/**
 * Executa o pipeline para um usuário específico.
 */
async function runPipelineForUser(user: User, forceDiscovery: boolean): Promise<void> {
  const settings = getAppSettings(user.id);
  const maxReels = settings.max_reels_per_run;

  // Fase 1: Descobrir novos reels
  console.log(`\n📥 [Usuário #${user.id}] ── Fase de Descoberta ──`);
  const activeSources = getActiveSources(user.id);

  if (activeSources.length === 0) {
    console.log(`📥 [Usuário #${user.id}] Nenhum perfil-fonte ativo. Pulando descoberta.`);
  } else {
    console.log(`📥 [Usuário #${user.id}] ${activeSources.length} perfis-fonte ativos`);

    let totalDiscovered = 0;

    for (const source of activeSources) {
      if (source.username === 'manual') continue;

      // Limitar a frequência de descoberta automática para no máximo uma vez a cada 30 minutos
      if (!forceDiscovery && source.last_checked_at) {
        try {
          const lastCheckedISO = source.last_checked_at.replace(' ', 'T') + 'Z';
          const lastCheckedTime = new Date(lastCheckedISO).getTime();
          const diffMinutes = (Date.now() - lastCheckedTime) / (1000 * 60);
          if (diffMinutes < 30) {
            console.log(`📥 [Usuário #${user.id}] @${source.username}: Descoberta automática pulada (last check há ${diffMinutes.toFixed(1)} min)`);
            continue;
          }
        } catch (err) {
          // Prossegue se houver erro ao converter a data
        }
      }

      const platform = (source as any).platform || 'instagram';

      try {
        console.log(`📥 [Usuário #${user.id}] Descobrindo de ${platform}: @${source.username}...`);

        // ── Instagram: usar Apify se configurado (sem cookies, sem bloqueio de VPS) ──
        if (platform === 'instagram' && isApifyConfigured()) {
          console.log(`🤖 [Apify] Usando Apify para descoberta de @${source.username}`);

          const apifyReels = await discoverReelsApify(source.username, 10);
          let newCount = 0;

          for (const apifyReel of apifyReels) {
            const reelUrl = apifyReel.url;
            const existing = getReelByUrl(reelUrl, user.id);
            if (existing) continue;

            // Criar registro no banco com a URL direta do vídeo embutida no campo caption
            // (usada pelo pipeline de download para evitar cookies)
            createReel({
              source_id: source.id,
              source_username: source.username,
              instagram_url: reelUrl,
              instagram_id: apifyReel.id,
              // A legenda já vem da Apify — não precisa de AI rewrite se estiver preenchida
              caption: apifyReel.caption || '',
              hashtags: apifyReel.hashtags.join(' '),
              user_id: user.id,
              // Campo extra para o pipeline de download usar URL direta
              direct_video_url: apifyReel.videoUrl,
            });

            newCount++;
            totalDiscovered++;
          }

          updateSourceLastChecked(source.id);
          console.log(`🤖 [Apify] @${source.username}: ${newCount} novos reels descobertos`);

          // Jitter entre perfis para parecer comportamento humano
          if (activeSources.indexOf(source) < activeSources.length - 1) {
            await randomSleep(2000, 8000);
          }
          continue; // Próximo source
        }

        // ── Outras plataformas (TikTok, YouTube, Facebook) ou Instagram sem Apify ──
        const urls = await discoverReels(source.username, platform, 10);

        let newCount = 0;
        for (const url of urls) {
          // Verificar se já existe no banco para esse usuário
          const existing = getReelByUrl(url, user.id);
          if (existing) {
            continue;
          }

          // Extrair ID do vídeo
          const videoId = extractVideoId(url, platform);

          // Criar registro no banco
          createReel({
            source_id: source.id,
            source_username: source.username,
            instagram_url: url,
            instagram_id: videoId || undefined,
            user_id: user.id
          });

          newCount++;
          totalDiscovered++;
        }

        updateSourceLastChecked(source.id);
        console.log(`📥 [Usuário #${user.id}] @${source.username}: ${newCount} novos reels (${urls.length} total encontrados)`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`❌ [Usuário #${user.id}] Erro ao descobrir reels de @${source.username}: ${msg}`);
      }
    }

    console.log(`📥 [Usuário #${user.id}] Total de novos reels descobertos: ${totalDiscovered}`);
  }

  // Fase 2: Processar reels pendentes
  console.log(`\n🔄 [Usuário #${user.id}] ── Fase de Processamento ──`);

  // Buscar reels do usuário em estágios que precisam de processamento
  const pendingStages: ReelStage[] = [
    'discovered',
    'downloading',
    'downloaded',
    'processing',
    'processed',
    'uploading',
    'uploaded',
    'publishing',
  ];

  const pendingReels: { id: number; stage: ReelStage }[] = [];
  for (const stage of pendingStages) {
    const reels = getReelsByStage(user.id, stage, maxReels - pendingReels.length);
    for (const reel of reels) {
      if (pendingReels.length >= maxReels) break;
      pendingReels.push({ id: reel.id, stage: reel.stage });
    }
    if (pendingReels.length >= maxReels) break;
  }

  if (pendingReels.length === 0) {
    console.log(`🔄 [Usuário #${user.id}] Nenhum reel pendente para processar.`);
  } else {
    console.log(`🔄 [Usuário #${user.id}] ${pendingReels.length} reels para processar (limite: ${maxReels})`);

    let successCount = 0;
    let errorCount = 0;

    for (const pending of pendingReels) {
      try {
        const results = await processReel(pending.id);
        const hasError = results.some((r) => !r.success);

        if (hasError) {
          errorCount++;
        } else {
          successCount++;
        }

        // Log detalhado dos resultados
        for (const result of results) {
          const icon = result.success ? '✅' : '❌';
          console.log(
            `  ${icon} Reel #${result.reel_id} [${result.stage}]: ` +
              `${result.message} (${result.duration_ms}ms)`
          );
        }
      } catch (error) {
        errorCount++;
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`❌ [Usuário #${user.id}] Erro inesperado ao processar Reel #${pending.id}: ${msg}`);
        updateReelStage(pending.id, 'error', msg);
      }
    }

    console.log(`\n🔄 [Usuário #${user.id}] Processamento concluído: ${successCount} sucesso, ${errorCount} erros`);
  }
}

/**
 * Executa o pipeline completo:
 * 1. Descobre novos reels de todos os perfis-fonte ativos
 * 2. Processa cada reel pelo pipeline
 *
 * Se specificUserId for fornecido, executa apenas para esse usuário.
 * Caso contrário, executa para todos os usuários cadastrados no banco.
 */
export async function runPipeline(forceDiscovery = false, specificUserId?: number): Promise<void> {
  console.log('\n🚀 ===== Iniciando Pipeline Geral =====');
  console.log(`⏰ ${new Date().toISOString()}`);
  const startTime = Date.now();

  try {
    // Inicializar banco de dados
    initDatabase();
    ensureDirectories();

    const users = specificUserId
      ? ([getUserById(specificUserId)].filter(Boolean) as User[])
      : getAllUsers();

    if (users.length === 0) {
      console.log('🚀 Nenhum usuário cadastrado no sistema.');
      return;
    }

    console.log(`🚀 Executando pipeline para ${users.length} usuário(s)...`);

    for (const user of users) {
      console.log(`\n👤 ==============================================================`);
      console.log(`👤 USUÁRIO #${user.id}: ${user.email} (${user.name})`);
      console.log(`👤 ==============================================================`);
      try {
        await runPipelineForUser(user, forceDiscovery);
      } catch (userError) {
        console.error(`❌ Erro no pipeline do Usuário #${user.id} (${user.email}):`, userError);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🚀 ===== Pipeline Geral Concluído em ${totalTime}s =====\n`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Erro fatal no pipeline geral: ${msg}`);
    throw error;
  }
}

/**
 * Monta a legenda final para publicação a partir do template e dados do reel.
 */
function buildCaption(caption: string, hashtags: string, template: string): string {
  if (template) {
    return template
      .replace('{caption}', caption || '')
      .replace('{hashtags}', hashtags || '')
      .trim();
  }

  const parts: string[] = [];
  if (caption) parts.push(caption);
  if (hashtags) parts.push(hashtags);

  return parts.join('\n\n');
}
