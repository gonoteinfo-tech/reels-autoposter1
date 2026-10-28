# GO POST — pipeline persistente de Reels

Next.js 16.4.3 / React 19.3.1, Node.js 24 LTS, SQLite e um worker separado.
O painel registra tarefas no banco; a automação continua mesmo com o navegador fechado.

## Como funciona

- Instagram e Facebook: coleta de perfis com Bright Data, snapshots acompanhados a cada 15 segundos.
- TikTok/YouTube: descoberta e download com `yt-dlp` atualizado.
- Preparação: download limitado, legenda jornalística com Gemini, normalização 1080×1920/H.264/AAC e marca d'água opcional com FFmpeg.
- Cloudflare R2: envio em stream; URL pública usada pela Meta.
- Instagram/Facebook: sessões e resultados persistidos por destino. Uma rede concluída não é reenviada ao retentar a outra.
- Falhas transitórias: até cinco tentativas, backoff e respeito a `Retry-After` da Meta.
- Credenciais/configuração ausentes: estado bloqueado com orientação no painel. Salvar configurações reavalia esses bloqueios.
- Resposta externa incerta: revisão necessária. O painel permite confirmar o post existente ou autorizar outra tentativa após verificar que não houve envio/coleta.

Fila SQLite com transações, deduplicação, lease, heartbeat e token de execução. Um worker ativo por VPS, uma operação pesada e uma coleta simultâneas. SQLite deve estar em disco local; não use NFS nem compartilhe o arquivo entre servidores.

## Requisitos

1. Node.js **24.22.1+** da linha 24 LTS (`.nvmrc` incluído).
2. FFmpeg e ffprobe com `libx264` e AAC. O código usa os executáveis do sistema; configure `FFMPEG_PATH`/`FFPROBE_PATH` para a versão estável instalada por você. Smoke test local executado com FFmpeg 6.1.1; não há download automático de binários desatualizados por npm.
3. `yt-dlp` recente para TikTok/YouTube e links avulsos do Facebook. Perfis Facebook são coletados pela Bright Data.
4. Credenciais Gemini, Bright Data, Cloudflare R2 e app Meta com permissões e OAuth corretos.
5. Espaço livre mínimo de 1 GB antes da preparação; configure os limites no `.env.local`.

```bash
npm ci
cp .env.example .env.local
# Preencha as variáveis e preserve os valores do seu app Meta/Google existente.
npm test
npm run typecheck
npm run lint
npm run build
```

`npm ci` precisa incluir dependências de desenvolvimento durante o build. O worker usa `tsx` como dependência de produção. Não copie `.env.local`, banco ou cookies para o Git.

Em desenvolvimento, dois terminais:

```bash
npm run dev
```

```bash
npm run worker
```

O diretório `DATA_DIR` precisa ser o mesmo nos dois processos. Sem ele, o padrão é `data/` no diretório do projeto. O worker e o web devem usar as mesmas variáveis de ambiente.

## Implantar na VPS existente

Os exemplos consideram `/opt/reels-autoposter` e usuário `ubuntu`, conforme a instalação investigada. Ajuste `WorkingDirectory`, `User`, `Group`, `ExecStart`, `DATA_DIR` e `ReadWritePaths` nos arquivos em `deploy/` se forem diferentes. Confirme o caminho do Node com `command -v node`; instalações via NVM podem não usar `/usr/bin/node`.

1. Guarde o commit atual: `git rev-parse HEAD`. Identifique o serviço que executa a versão antiga com `systemctl status <PID>`. Pare esse serviço antes da migração e desative seu início automático ao substituí-lo. Não deixe o cron antigo e o worker novo publicarem em paralelo.
2. Faça backup do banco **antes de executar o código novo**. O comando abaixo usa a API de backup SQLite, incluindo alterações ainda no WAL; não copie apenas `reels.db` com o app ativo.

```bash
cd /opt/reels-autoposter
node - <<'NODE'
const Database = require('better-sqlite3');
const fs = require('fs');
fs.mkdirSync('data/backups', { recursive: true, mode: 0o700 });
const db = new Database('data/reels.db', { readonly: true, fileMustExist: true });
const target = `data/backups/pre-upgrade-${Date.now()}.db`;
db.backup(target).then(() => { fs.chmodSync(target, 0o600); console.log(target); }).finally(() => db.close());
NODE
```

3. Faça checkout da branch/release revisada, mantendo `data/`, `.env.local` e cookies. Execute `npm ci`, os testes, `npm run typecheck`, `npm run lint` e `npm run build`. Confira `.env.example` e atualize `.env.local`; a versão Graph padrão é `v26.0`, configurável por `META_GRAPH_VERSION`.
4. Crie os diretórios e instale os serviços. Não substitua um serviço com outro nome sem antes desativar o serviço antigo.

```bash
mkdir -p data .next/cache
sudo chown -R ubuntu:ubuntu data .next/cache
sudo install -m 0644 deploy/reels-web.service /etc/systemd/system/reels-web.service
sudo install -m 0644 deploy/reels-worker.service /etc/systemd/system/reels-worker.service
sudo systemctl daemon-reload
sudo systemctl enable --now reels-web reels-worker
sudo systemctl status reels-web reels-worker --no-pager
```

Mantenha seu nginx apontando para `127.0.0.1:3000`. O processo web não inicia o worker por conta própria.

```bash
npm run doctor
sudo journalctl -u reels-worker -n 100 --no-pager -o cat
sudo journalctl -u reels-web -n 100 --no-pager -o cat
```

O diagnóstico não faz chamadas externas nem mostra tokens. Ele verifica executáveis, presença das variáveis, integridade do banco e heartbeat. Configuração presente não comprova validade de credenciais. Um exit code 1 indica itens pendentes.

## Configurar cada conta

1. Entre com a conta que será dona das fontes e Reels.
2. Em Configurações → Conta Meta, conecte o Facebook e **selecione a página**. A seleção deve ser salva e o nome da página deve aparecer. Para Instagram, vincule uma conta Business/Creator compatível à página.
3. Habilite os destinos desejados. Configure frequência de coleta, expressão cron e intervalo entre posts. O fuso do worker usa `TZ` (padrão `America/Sao_Paulo`).
4. Adicione as fontes e acompanhe “Atividade da automação”. As credenciais `.env` do usuário #1 não são usadas para outras contas.
5. A seleção de páginas OAuth fica disponível por 10 minutos e sobrevive a reinício do web. Se expirar, reconecte.

“Rodar agora”, sincronizar fonte, publicar e reprocessar retornam **HTTP 202** com IDs de tarefas persistidas. A resposta significa enfileiramento; o estado final aparece no painel. GETs não iniciam o agendador nem revertem uma pausa.

A pausa global impede novas admissões; o trabalho em andamento pode terminar. Desligar publicação automática bloqueia novas tarefas automáticas; uma publicação manual explicitamente solicitada continua permitida. Não desligue serviços durante um envio se puder esperar sua conclusão.

## Migração e recuperação

- Migrações são aditivas para a versão já multiusuário investigada; usuários, fontes, configurações, caminhos e IDs externos são preservados. IDs de vídeos recebem namespace por plataforma para evitar colisões.
- Reels antigos publicados não entram na fila. Erros antigos são importados bloqueados; revise antes de reprocessar. Publicações antigas interrompidas ficam em revisão, pois o resultado remoto pode ser incerto.
- Um erro temporário de IA preserva o download já concluído. Reprocessar usa os artefatos existentes.
- Uma publicação parcial pode aparecer com erro no destino restante, com o ID da rede concluída preservado.
- Em revisão necessária, confira a plataforma antes de usar “Confirmei que não houve envio”. Essa confirmação pode iniciar nova coleta paga ou novo post.
- Quando a operação remota concluiu, informe o ID existente com “Confirmar post existente”; a fila só reconcilia o resultado.
- API de diagnóstico de tarefa: `GET /api/pipeline/jobs?id=<id>` (sessão autenticada e somente proprietário).
- Eventos da fila são mantidos por 30 dias. Arquivos com referência pendente não são apagados após publicação.

Depois da migração, backups consistentes podem ser feitos com:

```bash
npm run backup
```

**Rollback:** pare `reels-worker` e `reels-web`, guarde um backup atual e os novos IDs externos. Prefira voltar apenas o código quando o esquema aditivo for compatível. Não restaure cegamente um banco anterior a posts já efetuados: isso apaga os IDs locais e pode provocar duplicatas. Se a restauração for indispensável, reconcilie os posts novos antes de reativar qualquer publicação. Mantenha uma cópia do banco atual e faça a restauração com ambos os serviços parados.

## Validação antes de liberar publicação automática

Os testes locais verificam fila SQLite real, fencing, limites, isolamento, migração, contratos de coleta, retomada, publicação por destino e FFmpeg real. APIs externas são simuladas nos testes; nenhum teste publica em redes sociais nem consome créditos Bright Data.

Na VPS, com suas credenciais, valide uma fonte real, uma legenda, a URL pública R2 e uma publicação autorizada em cada destino. Confirme os IDs e o estado final no painel. O acesso à VPS, os tokens reais, as permissões do app Meta, o saldo do scraper e disponibilidade dos provedores precisam estar corretos para essa validação ponta a ponta.

Fontes técnicas: [Next.js 16.4](https://nextjs.org/blog/next-16-4), [Facebook Reels Bright Data](https://docs.brightdata.com/api-reference/scrapers/social-media-apis/facebook-reels-collect-by-url), [Meta Reels publishing collection](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api), [Meta SDK Graph version](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/apiconfig.py).
