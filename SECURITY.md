# Segurança

## Segredos ativos

- Mantenha `.env`, `data/`, cookies, bancos SQLite e vídeos fora do Git.
- Configure `APP_URL` com uma origem HTTPS fixa em produção.
- Use uma `SETTINGS_ENCRYPTION_KEY` longa, aleatória, estável e armazenada no gerenciador de segredos do servidor.
- Não registre tokens, cookies de sessão ou respostas completas dos provedores OAuth.

Ao configurar `SETTINGS_ENCRYPTION_KEY`, tokens existentes em texto simples são criptografados automaticamente na inicialização, sem serem alterados ou invalidados. Não remova nem troque essa chave sem primeiro planejar a migração dos dados.

## Histórico Git

Remover um segredo ou banco do commit atual não o remove de commits antigos. Se dados sensíveis já foram publicados no histórico deste repositório, a única resposta completa inclui:

1. revogar e emitir novas credenciais no provedor;
2. invalidar sessões expostas;
3. reescrever o histórico com uma ferramenta apropriada;
4. fazer push forçado coordenado e orientar todos os colaboradores a clonar novamente.

Essas ações são destrutivas e invalidam credenciais. Portanto, não são executadas automaticamente por este projeto nem por uma correção local.

## Relato

Relate vulnerabilidades de forma privada ao mantenedor do repositório. Não publique tokens, bancos, cookies ou dados pessoais em issues.
