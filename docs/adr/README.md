# Architecture Decision Records

Um ADR registra uma decisão que custa caro para reverter, o contexto em que foi
tomada e o que se aceitou perder. Não é documentação de como o código funciona —
isso está em `docs/arquitetura.md`.

## Quando escrever um

- A decisão amarra o projeto a uma dependência, um formato ou uma topologia
- Alguém vai perguntar "por que não fizeram do jeito óbvio?" daqui a três meses
- Foi preciso escolher entre duas opções defensáveis

Mudança de ideia **não** edita o ADR antigo: escreve um novo que o supera, e marca o
antigo como `Superado por ADR XXXX`. O histórico é o valor.

## Status

`Aceito` · `Proposto` (ainda em aberto) · `Superado por ADR XXXX`

## Índice

| # | Decisão | Status |
|---|---|---|
| [0001](0001-monorepo-pnpm.md) | Monorepo pnpm com pacotes em TypeScript | Superado em parte por 0020 |
| [0002](0002-mvp-le-arquivo-em-disco.md) | MVP lê `.ibt` em disco; ao vivo fica para a fase 2 | Aceito |
| [0003](0003-decoder-proprio-vs-lib.md) | Decoder próprio como default, `ibt-telemetry` como validação | Proposto |
| [0004](0004-ingestao-watcher-local.md) | Ingestão por watcher local | Aceito |
| [0005](0005-camada-agentica-ai-sdk.md) | AI SDK da Vercel em vez de Mastra | Aceito |
| [0006](0006-provider-llm-barato.md) | Gemini Flash como default, NVIDIA NIM como alternativa | Aceito |
| [0007](0007-persistencia-e-downsampling.md) | Persistência e downsampling | Superado em parte por 0019 |
| [0008](0008-volta-de-referencia.md) | Volta de referência importada | Aceito |
| [0009](0009-arquitetura-hexagonal.md) | Arquitetura hexagonal com dependências invertidas | Superado por 0020 |
| [0010](0010-cqs-na-aplicacao.md) | CQS na camada de aplicação | Superado por 0020 |
| [0011](0011-topologia-tres-aplicacoes.md) | Três aplicações e a fronteira de autonomia | Superado em parte por 0020 |
| [0012](0012-electron-no-desktop.md) | Electron no aplicativo do Windows | Aceito |
| [0013](0013-sincronizacao-e-visibilidade.md) | Publicação automática com visibilidade controlada | Aceito |
| [0014](0014-autenticacao-iron-session.md) | Um login para as duas aplicações, com iron-session | Aceito |
| [0015](0015-dois-bancos.md) | SQLite local e Postgres na nuvem | Aceito |
| [0016](0016-so-o-desktop-gera-telemetria.md) | Só o desktop gera telemetria | Superado em parte por 0020 |
| [0017](0017-desktop-e-o-produto.md) | O desktop é o produto; a nuvem é acessório | Aceito |
| [0018](0018-so-volta-valida-e-material-de-analise.md) | Só volta válida é material de análise | Superado em parte por 0021 |
| [0019](0019-grava-a-amostra-como-o-arquivo-entregou.md) | Grava a amostra como o arquivo entregou | Aceito |
| [0020](0020-aplicacoes-independentes.md) | Três aplicações independentes, sem código compartilhado | Aceito |
| [0021](0021-saida-de-pista-sem-punicao-conta-na-sessao.md) | Saída de pista sem punição conta na sessão; a referência continua limpa | Aceito |
| [0022](0022-o-app-so-le-do-iracing.md) | O app só lê do iRacing; nunca manda comando para o sim | Aceito |
