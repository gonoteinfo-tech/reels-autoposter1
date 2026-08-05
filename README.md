# Reels AutoPoster

Aplicação Next.js para descobrir vídeos, processá-los com FFmpeg, armazená-los no Cloudflare R2 e publicar no Instagram Business e em páginas do Facebook.

## Principais componentes

- Next.js 16 e React 19 para painel e APIs.
- SQLite em `data/reels.db` para usuários, sessões, configurações, fila, locks e limites de uso.
- Google OAuth para login e Meta OAuth para autorizar páginas.
- Apify ou `yt-dlp` para descoberta e download.
- FFmpeg para aplicar a logo.
- Cloudflare R2 para disponibilizar o vídeo à API da Meta.

Tokens de página nunca são devolvidos ao navegador. Sessões novas são armazenadas por hash; sessões legadas continuam válidas e são migradas no primeiro uso.

## Requisitos

- Node.js 20.9 ou superior.
- Uma aplicação Google OAuth.
- Uma aplicação Meta com as permissões usadas pelo fluxo de publicação.
- Bucket Cloudflare R2 com URL pública.
- Apify e OpenAI são opcionais.
- `yt-dlp` deve estar disponível no ambiente quando o fallback local for usado.

## Instalação

```bash
npm ci
cp .env.example .env
npm run dev
```

Abra `http://localhost:3000`. Antes de produção, execute:

```bash
npm run check
npm audit --audit-level=high
```

## Configuração

Use [.env.example](./.env.example) como referência. Nunca versiona o arquivo `.env` real.

Variáveis especialmente importantes:

- `APP_URL`: origem canônica completa. Em produção deve usar HTTPS, por exemplo `https://reels.exemplo.com`.
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`: login do painel.
- `FACEBOOK_APP_ID` e `FACEBOOK_APP_SECRET`: autorização das páginas Meta.
- `R2_*`: bucket, credenciais e URL pública do Cloudflare R2.
- `SETTINGS_ENCRYPTION_KEY`: chave estável para criptografar tokens já salvos e novos tokens no SQLite. Se ativá-la, mantenha um backup seguro; trocar ou perder a chave impede a leitura dos valores criptografados.

Callbacks OAuth:

- Google: `${APP_URL}/api/auth/google/callback`
- Meta: `${APP_URL}/api/auth/facebook/callback`

## Implantação

Este projeto usa SQLite, arquivos de vídeo locais e logos gravadas em disco. Implante em um servidor Node com volume persistente para `data/` e `public/logos/`, atrás de um proxy reverso com HTTPS.

Não execute várias réplicas com cópias diferentes do SQLite. Os locks evitam trabalho duplicado apenas entre processos que compartilham o mesmo arquivo de banco. Uma implantação serverless sem disco persistente não é adequada para esta arquitetura.

Faça backup conjunto de:

- `data/reels.db` e seus arquivos WAL/SHM, usando um procedimento consistente para SQLite;
- `public/logos/`;
- a chave `SETTINGS_ENCRYPTION_KEY`, quando configurada.

## Scripts

- `npm run dev`: desenvolvimento.
- `npm run lint`: análise estática.
- `npm test`: testes automatizados.
- `npm run build`: build de produção.
- `npm run check`: lint, testes e build.

## Segurança e conteúdo

Consulte [SECURITY.md](./SECURITY.md) para configuração e resposta a exposição histórica. Publique apenas conteúdo que você possui ou tem autorização para reutilizar e respeite as políticas das plataformas.
