import OpenAI from 'openai';

const getOpenAI = (): OpenAI | null => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
};

/**
 * Garante que a legenda possua no mínimo `minCount` (padrão 6) hashtags relevantes.
 * Caso a legenda contenha menos que o mínimo, complementa com as hashtags da fonte original
 * e com hashtags temáticas diretamente relacionadas às palavras-chave e contexto do texto.
 */
export function ensureMinimumHashtags(caption: string, sourceHashtags?: string, minCount = 6): string {
  const hashtagRegex = /#[\p{L}\p{N}_]+/gu;
  const existingMatches = (caption || '').match(hashtagRegex) || [];
  const existingTags = new Set(existingMatches.map(t => t.toLowerCase()));

  // Se já possui pelo menos a quantidade mínima requerida, retorna intacto
  if (existingTags.size >= minCount) {
    return caption;
  }

  const additionalTags: string[] = [];

  // 1. Tentar adicionar hashtags da fonte original
  if (sourceHashtags) {
    const sourceMatches = sourceHashtags.match(hashtagRegex) || [];
    for (const tag of sourceMatches) {
      const cleanTag = tag.trim();
      const lower = cleanTag.toLowerCase();
      if (!existingTags.has(lower) && !additionalTags.map(t => t.toLowerCase()).includes(lower)) {
        additionalTags.push(cleanTag);
        if (existingTags.size + additionalTags.length >= minCount) {
          break;
        }
      }
    }
  }

  // 2. Se ainda faltar para atingir o mínimo de 6, identificar temas na legenda
  if (existingTags.size + additionalTags.length < minCount) {
    const textLower = ((caption || '') + ' ' + (sourceHashtags || '')).toLowerCase();

    const themeMap: { keywords: string[]; tags: string[] }[] = [
      {
        keywords: ['curiosidade', 'curioso', 'sabia', 'incrivel', 'impressionante', 'glitch', 'fato', 'fatos', 'descobrir', 'bizarro', 'vocesabia'],
        tags: ['#curiosidades', '#fatoscuriosos', '#vocesabia', '#curiosidade', '#fatosdesconhecidos', '#aprendanotiktok']
      },
      {
        keywords: ['ciencia', 'fisica', 'quimica', 'biologia', 'espaco', 'universo', 'planeta', 'terra', 'lua', 'astronomia', 'galaxia'],
        tags: ['#ciencia', '#astronomia', '#cienciatododia', '#universo', '#astrofisica', '#curiosidadescientificas']
      },
      {
        keywords: ['historia', 'guerra', 'passado', 'seculo', 'imperio', 'antigo', 'anos', 'militar', 'soldado', 'roma', 'egito'],
        tags: ['#historia', '#historiadobrasil', '#curiosidadeshistoricas', '#fatosantigos', '#historiageral', '#fatosdehistoria']
      },
      {
        keywords: ['animal', 'animais', 'natureza', 'bicho', 'tubarao', 'oceano', 'mar', 'floresta', 'passaro', 'selvagem', 'fauna', 'pet', 'cachorro', 'gato'],
        tags: ['#animais', '#natureza', '#mundoanimal', '#vidaanimal', '#naturezaselvagem', '#fauna']
      },
      {
        keywords: ['tecnologia', 'tech', 'celular', 'smartphone', 'computador', 'ia', 'inteligencia artificial', 'software', 'app', 'robo', 'futuro'],
        tags: ['#tecnologia', '#inovacao', '#techtok', '#dicasdetecnologia', '#inteligenciaartificial', '#smartphone']
      },
      {
        keywords: ['psicologia', 'mente', 'cerebro', 'habito', 'comportamento', 'memoria', 'sono', 'pensamento', 'emocao', 'ansiedade'],
        tags: ['#psicologia', '#mente', '#cerebro', '#desenvolvimentopessoal', '#saudemental', '#psicologiacuriosa']
      },
      {
        keywords: ['dinheiro', 'financas', 'renda', 'investimento', 'riqueza', 'economia', 'negocios', 'trabalho', 'vendas', 'empreendedor'],
        tags: ['#financas', '#investimentos', '#empreendedorismo', '#educacaofinanceira', '#negocios', '#sucesso']
      },
      {
        keywords: ['humor', 'engracado', 'rir', 'comedia', 'meme', 'piada', 'risada', 'ironia'],
        tags: ['#humor', '#comedia', '#engracado', '#memesbrasil', '#rir', '#videosengracados']
      },
      {
        keywords: ['saude', 'treino', 'academia', 'dieta', 'emagrecer', 'corpo', 'musculo', 'fitness', 'exercicio', 'nutricao'],
        tags: ['#fitness', '#saude', '#treino', '#vidasaudavel', '#bemestar', '#vidafit']
      },
      {
        keywords: ['noticia', 'urgente', 'brasil', 'mundo', 'aconteceu', 'alerta', 'politica', 'cidade', 'goias', 'anapolis', 'noticias'],
        tags: ['#noticias', '#urgente', '#noticiadodia', '#jornalismo', '#informacao', '#brasil']
      }
    ];

    const fallbackViralTags = [
      '#reels',
      '#reelsbrasil',
      '#viral',
      '#explore',
      '#explorar',
      '#foryou',
      '#trend',
      '#fyp',
      '#instagramreels'
    ];

    const candidateTags: string[] = [];

    // Adiciona tags temáticas compatíveis
    for (const theme of themeMap) {
      if (theme.keywords.some(k => textLower.includes(k))) {
        candidateTags.push(...theme.tags);
      }
    }

    // Complementa com tags virais para garantir o preenchimento
    candidateTags.push(...fallbackViralTags);

    for (const tag of candidateTags) {
      const lower = tag.toLowerCase();
      if (!existingTags.has(lower) && !additionalTags.map(t => t.toLowerCase()).includes(lower)) {
        additionalTags.push(tag);
        if (existingTags.size + additionalTags.length >= minCount) {
          break;
        }
      }
    }
  }

  if (additionalTags.length === 0) {
    return caption || '';
  }

  const tagsString = additionalTags.join(' ');
  return caption ? `${caption.trim()}\n\n${tagsString}` : tagsString;
}

/**
 * Reescreve uma legenda para torná-la mais engajadora e viral no Reels do Instagram e Facebook,
 * garantindo no mínimo 6 hashtags relacionadas.
 * 
 * @param originalCaption Legenda original do Reel
 * @param sourceHashtags Hashtags originais da fonte (opcional)
 * @returns Legenda reescrita pela IA ou a legenda original com hashtags garantidas
 */
export async function rewriteCaption(originalCaption: string, sourceHashtags?: string): Promise<string> {
  const openai = getOpenAI();
  if (!openai) {
    console.log('🤖 OpenAI API Key não configurada. Usando legenda original com hashtags.');
    return ensureMinimumHashtags(originalCaption, sourceHashtags, 6);
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemPrompt = `Você é um copywriter de elite especializado em engajamento para vídeos de Instagram Reels e TikTok em português do Brasil.
Seu objetivo é reescrever a legenda original de um vídeo curto para torná-la extremamente viral, persuasiva e atraente.

Regras da Legenda Reescrita:
1. Deve ser magnética e ter um gancho forte na primeira linha.
2. Use parágrafos curtos e espaçamento limpo para facilitar a leitura rápida.
3. Use emojis estratégicos e adequados ao conteúdo.
4. Adicione uma Chamada para Ação (CTA) clara no final (ex: "Compartilhe com um amigo que precisa ver isso!", "Siga para mais!", etc.).
5. Adicione OBRIGATORIAMENTE no mínimo 6 hashtags relevantes ao final (entre 6 e 10 hashtags) diretamente relacionadas ao conteúdo e nicho do vídeo/legenda, além de hashtags estratégicas de descoberta no Reels (ex: #reels, #explore, #viral, etc.). NUNCA use menos de 6 hashtags.
6. Mantenha o mesmo sentido e tom da mensagem original, mas muito mais polida e viral.

Responda apenas com o texto da nova legenda, sem explicações antes ou depois.`;

  try {
    console.log('🤖 Solicitando reescrita de legenda via OpenAI...');
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `LEGENDA ORIGINAL:\n\n${originalCaption || 'Sem legenda original.'}` }
      ],
      temperature: 0.8,
    });

    const content = response.choices[0].message.content?.trim();
    if (!content) throw new Error('OpenAI retornou uma resposta vazia.');

    console.log('🤖 Legenda reescrita com sucesso.');
    return ensureMinimumHashtags(content, sourceHashtags, 6);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Erro ao reescrever legenda com IA: ${msg}`);
    return ensureMinimumHashtags(originalCaption, sourceHashtags, 6);
  }
}
