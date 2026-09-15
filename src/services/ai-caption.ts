import OpenAI from 'openai';

const getOpenAI = (): OpenAI | null => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
};

// Lista de hashtags genéricas expressamente proibidas (devem ser excluídas de qualquer legenda)
const GENERIC_TAGS_BLACKLIST = new Set([
  '#reels',
  '#reelsbrasil',
  '#reelsinstagram',
  '#reelsinsta',
  '#reelsvideo',
  '#viral',
  '#viralreels',
  '#viralvideo',
  '#virais',
  '#explore',
  '#explorar',
  '#foryou',
  '#foryoupage',
  '#paravoce',
  '#fyp',
  '#fy',
  '#trend',
  '#trending',
  '#instagram',
  '#instagramreels',
  '#video',
  '#videos',
  '#feed',
  '#post',
  '#status',
  '#top',
  '#brasil'
]);

/**
 * Verifica se uma hashtag é genérica ou vazia de contexto.
 */
export function isGenericHashtag(tag: string): boolean {
  const lower = tag.trim().toLowerCase();
  if (GENERIC_TAGS_BLACKLIST.has(lower)) return true;
  if (
    lower.startsWith('#reel') ||
    lower.startsWith('#viral') ||
    lower.startsWith('#explore') ||
    lower.startsWith('#explorar') ||
    lower.startsWith('#foryou') ||
    lower.startsWith('#fyp') ||
    lower.startsWith('#trend')
  ) {
    return true;
  }
  return false;
}

// Stopwords para extração limpa de palavras-chave da legenda
const STOPWORDS = new Set([
  'para', 'com', 'esse', 'essa', 'esses', 'essas', 'este', 'esta', 'estes', 'estas',
  'aquele', 'aquela', 'aqueles', 'aquelas', 'isso', 'isto', 'aquilo', 'voce', 'você',
  'voces', 'vocês', 'como', 'mais', 'menos', 'muito', 'muita', 'muitos', 'muitas',
  'pelo', 'pela', 'pelos', 'pelas', 'sobre', 'onde', 'quando', 'tudo', 'nada',
  'cada', 'esta', 'está', 'estao', 'estão', 'eram', 'seria', 'qual', 'quais',
  'eles', 'elas', 'dele', 'dela', 'deles', 'delas', 'seus', 'suas', 'nosso', 'nossa',
  'aqui', 'ali', 'alem', 'além', 'ainda', 'assim', 'mesmo', 'mesma', 'porque',
  'tempo', 'anos', 'fazer', 'pode', 'podem', 'dizer', 'saber', 'veja', 'olha',
  'agora', 'depois', 'antes', 'entre', 'contra', 'sempre', 'nunca', 'quase',
  'hoje', 'ontem', 'amanha', 'amanhã', 'toda', 'todo', 'todos', 'todas', 'chamado',
  'chamada', 'chamados', 'chamadas', 'apenas', 'durante', 'enquanto', 'segundo',
  'drop', 'emoji', 'follow', 'share', 'like', 'siga', 'curta', 'compartilhe',
  'amigo', 'amiga', 'mind', 'blown', 'the', 'and', 'with', 'from', 'this', 'that',
  'your', 'have', 'what', 'know', 'called', 'faster', 'than', 'under', 'while'
]);

// Mapeamento temático ultra específico (sem tags genéricas)
const THEMES = [
  {
    keywords: ['tubarao', 'tubaroes', 'mar', 'oceano', 'oceanos', 'peixe', 'peixes', 'animal', 'animais', 'bicho', 'natureza', 'floresta', 'passaro', 'baleia', 'golfinho', 'selvagem', 'fauna', 'pet', 'cachorro', 'gato', 'corvo'],
    tags: ['#biologiamarinha', '#animaisaquaticos', '#faunamarina', '#vidaanimal', '#curiosidadesanimais', '#predadores', '#mundoanimal', '#naturezaselvagem']
  },
  {
    keywords: ['espaco', 'universo', 'saturno', 'planeta', 'planetas', 'galaxia', 'galaxias', 'estrela', 'estrelas', 'astronomia', 'cosmos', 'lua', 'terra', 'telescopio', 'alcool', 'sagittarius'],
    tags: ['#astronomia', '#espacosideral', '#astrofisica', '#cosmos', '#universo', '#planetas', '#galaxias', '#cienciadoespaco']
  },
  {
    keywords: ['cerebro', 'mente', 'memoria', 'memorias', 'sono', 'dormir', 'psicologia', 'pensamento', 'habito', 'comportamento', 'sinapse', 'sinaptica', 'glitch', 'mental', 'vibracao', 'smartphone', 'vicio'],
    tags: ['#neurociencia', '#cerebrohumano', '#psicologiacognitiva', '#fasesdosono', '#saudemental', '#memorias', '#comportamentohumano', '#psicologia']
  },
  {
    keywords: ['agua', 'gelo', 'quente', 'fria', 'congelar', 'congelamento', 'quimica', 'fisica', 'experimento', 'ciencia', 'mpemba', 'ferver', 'temperatura'],
    tags: ['#curiosidadescientificas', '#fisicadomundo', '#termodinamica', '#cienciaexperimental', '#quimica', '#efeitompemba', '#fenomenosdafisica']
  },
  {
    keywords: ['guerra', 'historia', 'exercito', 'soldado', 'soldados', 'roma', 'imperio', 'antigo', 'seculo', 'batalha', 'emu', 'australia', '1932'],
    tags: ['#historiaantiga', '#curiosidadeshistoricas', '#fatosantigos', '#historiageral', '#acontecimentos', '#historiadomundo', '#fatosmilitares']
  },
  {
    keywords: ['dinheiro', 'financas', 'renda', 'investimento', 'investimentos', 'riqueza', 'economia', 'negocios', 'trabalho', 'vendas', 'empreendedor', 'lucro'],
    tags: ['#educacaofinanceira', '#investimentos', '#empreendedorismo', '#negocios', '#financasinteligentes', '#economia']
  },
  {
    keywords: ['tecnologia', 'tech', 'celular', 'smartphone', 'computador', 'ia', 'inteligencia artificial', 'software', 'app', 'robo', 'futuro', 'gadget'],
    tags: ['#tecnologia', '#inovacaotecnologica', '#inteligenciaartificial', '#dicasdetecnologia', '#cienciadacomputacao']
  },
  {
    keywords: ['saude', 'treino', 'academia', 'dieta', 'emagrecer', 'corpo', 'musculo', 'fitness', 'exercicio', 'nutricao', 'alimento'],
    tags: ['#saudeebemestar', '#vidasaudavel', '#fitnessbrasil', '#nutricaoesportiva', '#fisiologiahumana']
  },
  {
    keywords: ['noticia', 'noticias', 'urgente', 'aconteceu', 'alerta', 'politica', 'cidade', 'jornalismo', 'goias', 'anapolis'],
    tags: ['#jornalismo', '#noticiadodia', '#informacao', '#fatosreais', '#acontecimentos']
  }
];

/**
 * Garante que a legenda possua no mínimo `minCount` (padrão 6) hashtags RELEVANTES e ESPECÍFICAS
 * do conteúdo do vídeo e da legenda, purgando totalmente hashtags genéricas como #viral, #reels, #explore, etc.
 */
export function ensureMinimumHashtags(caption: string, sourceHashtags?: string, minCount = 6): string {
  const hashtagRegex = /#[\p{L}\p{N}_]+/gu;

  // 1. Identifica tags válidas da legenda, descartando estritamente tags genéricas
  const existingMatches = (caption || '').match(hashtagRegex) || [];
  const existingTags = new Set<string>();

  for (const tag of existingMatches) {
    if (!isGenericHashtag(tag)) {
      existingTags.add(tag.toLowerCase());
    }
  }

  // Remove hashtags genéricas do corpo do texto da legenda
  let cleanCaption = (caption || '')
    .replace(hashtagRegex, (match) => isGenericHashtag(match) ? '' : match)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  // Se já atingiu o mínimo de tags válidas não-genéricas, retorna a legenda limpa
  if (existingTags.size >= minCount) {
    return cleanCaption;
  }

  const additionalTags: string[] = [];

  // 2. Aproveita hashtags da fonte original caso sejam específicas e não-genéricas
  if (sourceHashtags) {
    const sourceMatches = sourceHashtags.match(hashtagRegex) || [];
    for (const tag of sourceMatches) {
      if (!isGenericHashtag(tag)) {
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
  }

  // 3. Se ainda faltar para o mínimo de 6, cruza com temas específicos do conteúdo
  if (existingTags.size + additionalTags.length < minCount) {
    const normalizedText = ((cleanCaption || '') + ' ' + (sourceHashtags || ''))
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    for (const theme of THEMES) {
      if (theme.keywords.some(kw => normalizedText.includes(kw))) {
        for (const tag of theme.tags) {
          const lower = tag.toLowerCase();
          if (!existingTags.has(lower) && !additionalTags.map(t => t.toLowerCase()).includes(lower)) {
            additionalTags.push(tag);
            if (existingTags.size + additionalTags.length >= minCount) {
              break;
            }
          }
        }
      }
      if (existingTags.size + additionalTags.length >= minCount) {
        break;
      }
    }
  }

  // 4. Se ainda faltar, extrai palavras-chave substantivas da própria legenda
  if (existingTags.size + additionalTags.length < minCount) {
    const cleanWords = cleanCaption
      .replace(/https?:\/\/\S+/g, '')
      .replace(/#[\p{L}\p{N}_]+/gu, '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const words = cleanWords.match(/[a-z]{4,}/g) || [];
    for (const w of words) {
      if (!STOPWORDS.has(w) && w.length >= 4) {
        const tag = '#' + w;
        const lower = tag.toLowerCase();
        if (!isGenericHashtag(tag) && !existingTags.has(lower) && !additionalTags.map(t => t.toLowerCase()).includes(lower)) {
          additionalTags.push(tag);
          if (existingTags.size + additionalTags.length >= minCount) {
            break;
          }
        }
      }
    }
  }

  if (additionalTags.length === 0) {
    return cleanCaption;
  }

  const tagsString = additionalTags.join(' ');
  return cleanCaption ? `${cleanCaption}\n\n${tagsString}` : tagsString;
}

/**
 * Reescreve uma legenda para torná-la mais engajadora no Reels,
 * gerando e garantindo no mínimo 6 hashtags 100% relacionadas ao tema do vídeo e legenda (sem genéricas).
 * 
 * @param originalCaption Legenda original do Reel
 * @param sourceHashtags Hashtags originais da fonte (opcional)
 * @returns Legenda reescrita pela IA ou legenda original enriquecida com hashtags contextuais
 */
export async function rewriteCaption(originalCaption: string, sourceHashtags?: string): Promise<string> {
  const openai = getOpenAI();
  if (!openai) {
    console.log('🤖 OpenAI API Key não configurada. Usando legenda original com hashtags de conteúdo.');
    return ensureMinimumHashtags(originalCaption, sourceHashtags, 6);
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemPrompt = `Você é um copywriter de elite especializado em conteúdo de alto impacto para vídeos de Instagram Reels e TikTok em português do Brasil.
Seu objetivo é reescrever a legenda original de um vídeo curto para torná-la cativante, persuasiva e com alto engajamento.

Regras da Legenda Reescrita:
1. Deve ser magnética e ter um gancho forte na primeira linha.
2. Use parágrafos curtos e espaçamento limpo para facilitar a leitura rápida.
3. Use emojis estratégicos e adequados ao conteúdo.
4. Adicione uma Chamada para Ação (CTA) clara no final (ex: "Compartilhe com alguém que precisa saber disso!", "Comente o que você achou!", etc.).
5. HASHTAGS EXCLUSIVAS DO CONTEÚDO (REGRA CRÍTICA E OBRIGATÓRIA):
   - Adicione OBRIGATORIAMENTE no final no mínimo 6 hashtags (entre 6 e 9 hashtags).
   - É TOTALMENTE PROIBIDO usar hashtags genéricas como #viral, #reels, #reelsbrasil, #explore, #explorar, #foryou, #fyp, #trend, #trending, #instagram, #video, #feed, #status, etc.
   - TODAS as hashtags DEVEM ser 100% específicas e diretamente conectadas ao conteúdo real, fatos, termos, espécies, locais, conceitos ou tema exato tratado no vídeo e na legenda.
   - Exemplos de hashtags corretas (100% relacionadas ao tema):
     * Vídeo sobre tubarões/mar: #tubarao #biologiamarinha #animaisaquaticos #faunamarina #predadores #curiosidadesanimais
     * Vídeo sobre espaço/planetas: #astronomia #espacosideral #cosmos #universo #planetas #galaxias
     * Vídeo sobre cérebro/memória: #neurociencia #memorias #fasesdosono #cerebrohumano #psicologiacognitiva #saudemental
     * Vídeo sobre física da água: #curiosidadescientificas #termodinamica #fisicadomundo #cienciaexperimental #efeitompemba #quimica
6. Mantenha o mesmo sentido e tom da mensagem original, mas muito mais polida e interessante.

Responda apenas com o texto da nova legenda, sem explicações antes ou depois.`;

  try {
    console.log('🤖 Solicitando reescrita de legenda via OpenAI com foco em hashtags temáticas...');
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `LEGENDA ORIGINAL:\n\n${originalCaption || 'Sem legenda original.'}` }
      ],
      temperature: 0.7,
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
