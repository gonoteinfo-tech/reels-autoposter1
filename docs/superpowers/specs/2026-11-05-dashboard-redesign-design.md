# GO POST — painel claro e elegante

## Intenção

Repaginar o painel para tornar a biblioteca de Reels visual, agradável e fácil de operar. O usuário pediu cards de vídeo e todos os botões funcionando, e escolheu um visual claro e elegante.

## Direção e abordagem

Usar Next.js, React, Tailwind e os componentes/APIs existentes. Esta é a abordagem proposta: uma reformulação dos componentes do painel e do tema da área logada, acompanhada de correções dos contratos necessários às ações. A estrutura atual já oferece autenticação, fila persistente, vídeo autenticado e publicação por destino.

Uma alteração apenas de cores deixaria a fila em formato de tabela e os problemas de interação. Uma reconstrução completa exigiria substituir fluxos persistentes que já funcionam. A proposta concentra a mudança na experiência do painel e nos defeitos comprovados de suas ações, preservando o funcionamento do pipeline.

## Composição visual proposta

- Área logada em fundo branco-gelo, superfícies brancas, bordas suaves, sombras discretas e texto em grafite; coral como destaque principal. Identidade GO POST e tipografia instalada preservadas. A página pública mantém seu tema atual.
- Menu lateral claro, marca destacada, navegação ativa evidente, conta e destinos de publicação no rodapé. Navegação utilizável no celular e recolhimento no desktop.
- Cabeçalho com título, descrição curta, situação real da automação, atualização e botão destacado para adicionar vídeo.
- Resumo em quatro cards com ícones e números reais: publicados hoje, na fila, erros e fontes ativas. Estados de carregamento identificados.
- Biblioteca como foco principal: busca por legenda/perfil, filtros por etapa com agrupamento correto, contagem e paginação para alcançar vídeos antigos. Os filtros não alteram os números globais nem o histórico.
- Grade responsiva com cards de vídeo: prévia vertical 9:16, player acessível por clique/toque, duração quando conhecida, plataforma, etapa, autor, legenda resumida e ações identificáveis. Vídeos sem arquivo disponível mostram uma alternativa honesta, sem fotos ou miniaturas inventadas.
- Bloco de automação e atividade com próximos horários, tarefas em execução, bloqueios e revisões. Link para configurações quando falta alguma integração.
- Estados vazios distintos para biblioteca vazia e busca sem resultados; feedback de erro e sucesso visível, com opção de tentar novamente.

## Ações e contratos

- Adicionar vídeo: modal com URL/legenda, validação do servidor, prevenção de envio duplicado, fechamento por teclado, foco e feedback coerentes. Reabrir o modal não mantém sucesso ou erro obsoletos.
- Assistir: controles reais de vídeo, acesso por teclado/celular e mensagem caso a mídia não esteja disponível.
- Processar/reprocessar: preservar o contrato da fila existente, informando claramente quando a ação também pode publicar nos destinos habilitados; confirmação antes desse fluxo. Não transformar esta repaginação em mudança dos mecanismos de retry, fencing ou publicação.
- Publicar: permitir selecionar somente destinos habilitados, respeitar resultados já concluídos e mostrar estado pendente/erro. Publicação é tarefa enfileirada; não anunciar conclusão quando a API retorna 202.
- Excluir: confirmação clara; impedir duplo clique; só remover visualmente após sucesso ou restaurar caso falhe; respeitar 409 para trabalho em andamento.
- Atualizar, buscar, filtrar e paginar: operam sobre dados reais, com indicadores de carregamento e proteção contra respostas antigas sobrescrevendo filtros novos.
- Executar ciclo: feedback correto para fila pausada, worker offline ou nenhuma tarefa disponível; testes permanecem com fila pausada e dados isolados.
- Revisão de resultado incerto: manter confirmação de post existente e autorização de nova tentativa; conservar a explicação sobre possível consumo de créditos/publicação.
- Links de fontes, configurações, vídeo original e saída continuam operacionais.

## Escopo e decisões do implementador

O foco é o dashboard e sua estrutura compartilhada. Fontes e Configurações recebem compatibilidade com o tema claro; não serão reconstruídas integralmente. A página pública, login, credenciais, serviços externos e regras de publicação não serão redesenhados. O implementador decide ícones, espaçamentos, breakpoints, divisão interna dos componentes e detalhes de animação, mantendo contraste, foco e redução de movimento.

Podem ser ampliadas consultas do dashboard para busca, filtros agrupados, paginação e resumos independentes da lista, preservando a autorização por usuário e compatibilidade dos parâmetros existentes. Não serão criados dados demonstrativos na conta do usuário.

## Validação

- Testes de regressão focados em paginação/filtros e ações cujos contratos forem corrigidos.
- Testes de interação dos botões, respostas de erro, modais e vídeo com dados e mídia sintéticos em banco isolado; sem chamar provedores ou publicar conteúdo real.
- Revisão visual em desktop e celular, incluindo biblioteca populada, vazio, carregamento, erros e legendas longas.
- Executar testes existentes, lint, typecheck, build e smoke HTTP antes de concluir.
- Não prometer autenticação OAuth ou publicação real sem credenciais e validação específicas. O ambiente atual não tem essas credenciais.

## Critério de aceite

Painel claro e responsivo, cards de vídeo em destaque, navegação e todas as ações exibidas conectadas aos contratos reais, sem erros silenciosos nem ações decorativas. Dados anteriores, isolamento de usuários e garantias da fila preservados. O resultado será entregue implementado e validado após aprovação desta proposta.
