# Reconstrução do pipeline de Reels

Status: arquitetura aprovada pelo usuário em 28/10/2026; implementação na branch feat/pipeline-rebuild.
Base analisada: `97175f60e773bb185aa5e1e5c68ea2b20b8e4137`.

## Objetivo

Executar coleta, download, legenda jornalística, marca d'água, upload e publicação
com retomada após falhas, dados separados por usuário e motivos de bloqueio visíveis.
Preservar usuários, fontes, configurações, vídeos e publicações existentes.

## Abordagens

1. **Worker Node.js + fila SQLite (recomendação técnica):** reaproveita o banco e
   a VPS existentes. Web e worker são processos separados; a fila compartilha o
   banco local em WAL. Escopo: uma VPS com disco local, sem banco em NFS.
2. **BullMQ + Redis:** adequado para vários workers e servidores; adiciona um
   serviço persistente, sua operação e consistência entre Redis e SQLite.
   Adiar até haver necessidade de execução distribuída.
3. **Workflow gerenciado externo:** reduz operação da fila, mas introduz uma
   conta, custos e dependência de infraestrutura externa. Não é a recomendação
   para o aplicativo que já roda na VPS.

A recomendação é uma decisão proposta pelo implementador, ainda não uma escolha
aprovada pelo usuário. Implementar a primeira opção após aprovação desta proposta.

## Tecnologias e limites

- TypeScript; Node.js 24.22.1 LTS como base conhecida e testável. Reavaliar Node 26
  depois da disponibilidade LTS e da compatibilidade dos módulos nativos.
- Next.js estável 16.4.x e React 19.3, com versões exatas e lockfile após validar
  disponibilidade e compatibilidade. Sem dependências canary ou recursos experimentais.
- Manter SQLite e `better-sqlite3`, AWS SDK para Cloudflare R2 e SDK oficial Gemini.
- FFmpeg/ffprobe estáveis executados por `spawn`/`execFile` do Node, com argumentos
  separados, encerramento real por timeout e limites de CPU. Remover a dependência
  do wrapper antigo `fluent-ffmpeg` quando o caminho direto estiver validado.
- Publicação via Meta OAuth da própria conta; versão da Graph API centralizada,
  configurável e validada contra a documentação disponível e o app Meta do usuário.
- Não alterar identidade visual, planos comerciais ou provedor de hospedagem.
- Não prometer disponibilidade de redes externas ou publicação exatamente uma vez.

## Fluxo e persistência

APIs autenticadas apenas validam e gravam tarefas; retornam HTTP 202 com ID e
estado real. Um serviço systemd separado executa o worker desde o boot.
Nenhum trabalho longo fica dependente de requisições HTTP ou da abertura do painel.

Fila: `queued`, `running`, `retry_wait`, `blocked`, `succeeded`, `failed`,
`needs_review`, `cancelled`. Cada tarefa registra usuário, tipo, referência,
deduplicação, tentativa, prazo, erro sanitizado, horário e lease de execução.
Tipos: coletar fonte, acompanhar snapshot, preparar Reel, publicar destino.
O banco mantém eventos resumidos por tarefa, com retenção configurável.

A aquisição é transacional e condicional: apenas um dono pode executar a tarefa.
Lease com token de fencing, heartbeat e conclusão condicionada ao token atual.
Worker com uma execução pesada de vídeo por vez inicialmente; pequenos polls de
coleta não ficam aguardando FFmpeg. Reagendar polls sem ocupar a execução pesada.
SIGTERM interrompe admissão, encerra processos filhos e libera trabalho recuperável.

Etapas persistidas: descoberta → download → legenda → normalização/marca d'água
→ upload R2 → publicação por destino. Salvar o artefato e a etapa concluída antes
de avançar. Arquivos temporários exclusivos por usuário/Reel/tentativa; renomeação
atômica após conclusão. Upload em stream, sem carregar todo o vídeo na RAM.

## Coleta

- Instagram: reaproveitar Bright Data, persistindo snapshot, plataforma, início,
  próximas consultas e prazo total; acompanhar a cada 15–30 segundos, sem esperar
  mais um ciclo de 30 minutos. Consultas de snapshots pendentes independem do cron.
- Facebook: usar scraper Bright Data específico de Reels por URL de perfil,
  dataset documentado `gd_lyclm3ey2q6rww027t`, configurável. Não enviar página
  `/perfil/reels/` ao extrator genérico do yt-dlp para listar vídeos.
- TikTok e YouTube: manter caminhos existentes com yt-dlp estável e atualizado,
  validar URLs, cookies opcionais, limites e erros explícitos. Não anunciar suporte
  operacional sem passar pelos testes da respectiva plataforma.
- Registro canônico de plataforma + ID + usuário evita colisões de IDs entre redes.
  Guardar URL original e URL canônica; datas normalizadas para UTC.
- `cron_schedule` e intervalos por usuário/fonte vêm do banco. Sincronização manual
  ignora a espera da descoberta, mas conserva coleta pendente, orçamento configurado
  e deduplicação. Pausar o worker não é revertido por GET do painel.
- Validar resposta do scraper; itens com erro e snapshot vazio têm diagnósticos
  distintos. Retentativas limitadas de trigger incerto não podem gerar cobranças
  repetidas automaticamente; marcar situação ambígua para revisão.

## Preparação e publicação

Gemini reescreve mantendo fatos, nomes e créditos e produz ao menos seis hashtags
relevantes quando houver contexto. Não publicar legenda original como reserva.
Sem contexto, preservar a política de não inventar fatos. Falha de IA deve aparecer
como falha de legenda, mantendo o download já concluído para a próxima tentativa.

Mesmo sem logo, validar e normalizar vídeo para os requisitos dos destinos.
Timeouts e cancelamento real para download, IA, FFmpeg e upload. URLs de mídia
renováveis antes do download quando expiradas. Evitar redownload de arquivo válido.

Publicação separada em Instagram e Facebook, cada uma com estado e identificadores
externos próprios. Persistir container/sessão antes do próximo passo; sucesso em
uma rede não apaga falha na outra nem faz a rede concluída publicar novamente.
Consultar processamento remoto antes de marcar publicação como concluída.

Timeout ou reinício após envio externo: reconciliar pelo ID conhecido; quando o
resultado não puder ser determinado com segurança, usar `needs_review` e não
reenviar cegamente. Não há garantia de exactly-once em uma API sem chave idempotente.

Trava de ritmo por usuário e operação transacional; reprocessamento e publicação
manual passam pela mesma fila e não contornam a trava de concorrência.
Retentar falhas temporárias (rede/429/5xx) com backoff e jitter, respeitando
Retry-After. Padrão de cinco tentativas com teto de 30 minutos entre tentativas.
Configuração ausente, token inválido e mídia inválida geram bloqueio explícito,
sem laço infinito de requisições. Salvar configuração reavalia tarefas bloqueadas.

## Experiência no painel e isolamento

Exibir worker online/offline por heartbeat, última atividade, próxima execução,
etapa atual, tentativas, coleta em andamento e motivo acionável do bloqueio.
O botão executar informa enfileirado, já enfileirado ou bloqueado; erros HTTP são
mostrados. Mostrar publicação parcial por rede. Conectar página precisa concluir
a seleção e confirmar gravação do token e IDs no backend, sem expor o token no GET.

Credenciais permanecem segregadas por usuário. `.env` do administrador não passa
a valer para usuários comuns. A conta #5 exige página selecionada no OAuth; a
reconstrução mostra e recupera o bloqueio, mas não fornece consentimento por ela.
Endpoints de tarefas, eventos, Reels e fontes verificam propriedade no backend.

URLs recebidas são validadas, downloads verificam destinos e redirecionamentos
contra redes privadas e metadados de nuvem; aplicar limites de bytes/duração.
Não registrar tokens, cookies, URLs assinadas completas ou respostas sensíveis.
Limpar apenas arquivos próprios sem referência pendente; retenção de R2 separada
da limpeza local. Conferir espaço em disco antes de baixar/transcodificar.

## Migração e implantação

Migrações aditivas, versionadas e transacionais. Backup SQLite consistente pela
API de backup, incluindo dados em WAL. Testar banco legado e execução repetida da
migração antes de aplicar em produção; sem renomear/deletar dados por conveniência.
Importar fila antiga preservando artefatos existentes, erros e IDs de publicação.
Publicações concluídas nunca são reencaminhadas. Estados externos ambíguos vão para
revisão; erros permanentes importados ficam bloqueados com motivo.

Entregar `.env.example`, comando de diagnóstico sanitizado, unidades systemd web
e worker, instruções de backup, atualização e rollback. Usar diretório de dados
configurável compartilhado entre os dois processos e permissões de usuário dedicado.
Rollback exige parar worker novo antes de restaurar código/banco, preservando os
IDs externos publicados após o backup para não duplicar publicações.

Trabalhar em branch de reconstrução e entregar PR revisável. Acesso à VPS ainda
não está disponível nesta sessão; instalação e teste real precisam ser executados
no ambiente do usuário. A liberação de produção depende de teste real validado,
com contas autorizadas e créditos disponíveis nos provedores.

## Critérios de aceite e verificação

1. Worker reinicia, retoma tarefa e respeita lease; duas instâncias não executam
   a mesma tarefa. Testar expiração, token antigo e crash entre etapas.
2. Coleta Facebook não usa listagem yt-dlp rejeitada. Contratos de requisição e
   resposta de Instagram/Facebook cobertos por exemplos oficiais e servidor fake.
3. Snapshot pendente é acompanhado rapidamente e não gera triggers duplicados
   quando o usuário clica duas vezes ou worker reinicia.
4. Conta sem página mostra `blocked`; conectar página reavalia bloqueio apenas do
   dono. Token expirado exige reconexão, sem usar credenciais de outra conta.
5. Falha na legenda retoma sem novo download; falhas transitórias são retentadas
   e permanentes aparecem no painel. Publicação parcial retenta só o destino falho.
6. Timeout ambíguo de publicação não cria duplicata automática; nenhum resultado
   é marcado publicado apenas porque o upload remoto foi aceito.
7. Reprocessar em lote respeita CPU, intervalo e isolamento; arquivos de outro
   Reel/usuário não são removidos pela limpeza.
8. Migração do banco legado conserva dados e suporta segunda execução; fila não
   depende de abrir o dashboard. GETs não iniciam trabalho nem revertem pausa.
9. Rodar testes unitários/integrados, typecheck, lint e build de produção; smoke
   test com FFmpeg real e mídia de teste local sem chamar publicação externa.
10. Validar na VPS uma coleta e uma publicação autorizada por destino antes de
    afirmar funcionamento ponta a ponta em produção. Registrar resultado e IDs,
    sem publicar vídeos adicionais como parte dos testes automáticos.

## Referências verificadas em 28/10/2026

- https://nodejs.org/en/blog/release — Node 24.22.1 LTS.
- https://nextjs.org/blog/next-16-4 — Next 16.4 e React 19.3.
- https://github.com/vercel/next.js/releases — conferir patch estável antes do lockfile.
- https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-reels-collect-by-url
- https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026
- https://docs.bullmq.io/patterns/idempotent-jobs — alternativa Redis considerada.
- A documentação Meta retornou HTTP 429 nesta consulta: validar versão e contratos
  oficiais antes da implementação da mudança de versão, sem inferir de blogs terceiros.
