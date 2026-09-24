# Arquitetura

## O que este sistema faz

Lê os arquivos `.ibt` que o iRacing grava em disco, recorta as voltas, compara a
volta do piloto com uma referência e usa um agente de LLM para explicar onde e
por que o tempo foi perdido. E deixa o piloto compartilhar o que quiser com
outros pilotos.

## As três aplicações

```
  ┌─ apps/desktop (Electron, Windows) ───────────────┐
  │  watcher → .ibt → SQLite → análise → LLM → tela  │  offline-first, sem HTTP
  └──────────────┬───────────────────────────────────┘
                 │ login · publica (fila + retry)        ← cliente gerado do OpenAPI
  ┌──────────────▼──────────────┐
  │  apps/api (NestJS + Prisma) │ ── Postgres            → Swagger em /docs
  └──────────────▲──────────────┘
                 │                                       ← cliente gerado do OpenAPI
  ┌──────────────┴──────────────┐
  │  apps/web (Next.js)         │  rede social, sem banco, sem LLM
  └─────────────────────────────┘
```

**As três são independentes** (ADR 0020): cada uma tem o próprio `package.json`,
lockfile, `node_modules` e `tsconfig`, e nenhuma importa código da outra. O que
as liga é o contrato HTTP da api, publicado como `apps/api/openapi.json`.

**O desktop é o produto** (ADR 0017) e a única origem de telemetria (ADR 0016).
Ingestão, banco local, comparação e LLM rodam nele, sem chamada HTTP. A api só
entra no que é social: login e publicação, sempre em segundo plano.

**A api é a rede social.** Recebe dado **já processado**, guarda no Postgres,
aplica quem pode ver o quê e devolve. Não tem o código do decoder nem da LLM —
não por regra, mas porque esse código só existe dentro de `apps/desktop`.

**A web só fala com a api.** Não tem banco, não fala com a máquina do piloto e
não decide visibilidade: pede à api, que decide.

## O contrato entre as aplicações

```
apps/api  ──  pnpm api:openapi  ──▶  apps/api/openapi.json
                                          │
                        pnpm api:types    ├──▶ apps/desktop/src/main/cloud/api-schema.d.ts
                                          └──▶ apps/web/src/lib/api-schema.d.ts
```

- Os DTOs da api são classes com `@ApiProperty` (Swagger) e `class-validator`
  (validação). O documento sai do mesmo código que o servidor roda.
- Desktop e web chamam com `openapi-fetch`, tipado pelo arquivo gerado. Rota ou
  campo que mudou na api vira erro de compilação no cliente depois de
  `pnpm api:types`.
- Os `.d.ts` gerados e o `openapi.json` são versionados: cada app builda sozinha,
  sem precisar da api por perto.

## apps/desktop

```
src/
  main/                 processo principal (Node)
    domain/             regras de corrida: voltas, séries, delta, condições. Sem I/O.
    ibt/                decoder do .ibt (offsets, session info CP1252) e openIbtFile
    db/                 LocalStore: o SQLite do piloto
    ingestion/          watcher da pasta do sim → ingestTelemetryFile
    analysis/           comparar com referência, promover referência, narrador (LLM)
    cloud/              cliente da api: login e fila de publicação
    ipc/                handlers dos canais, DTOs, ponte de eventos
    desktop.ts          monta store, watcher, cliente da api e narrador
    index.ts            Electron: janela, IPC, esteira de ingestão, flush da fila
  preload/              expõe só os canais declarados
  renderer/             React, navegador sem Node
  shared/               tipos que main, preload e renderer compartilham (IPC, DTOs)
```

Não há portas nem adapters: as funções recebem o `LocalStore` e chamam SQLite,
disco e modelo direto. Onde o teste precisa trocar algo, a função aceita a
alternativa como parâmetro — `ingestTelemetryFile` aceita `open` para receber um
`.ibt` falso; `requestLapAnalysis` recebe `narrate`.

Ler e gerar continuam separados por nome e por efeito: `getLapAnalysis` só lê o
relatório gravado, `requestLapAnalysis` chama o modelo e grava. Abrir a tela
nunca paga uma chamada de modelo.

O front conversa com o processo principal por **IPC** — não existe servidor HTTP
em `localhost`. Evento é aviso, não dado: o processo principal empurra
`{ type, ids }` e a tela consulta de novo.

## apps/api

NestJS padrão, ESM, compilado pelo Nest CLI com SWC.

```
src/
  prisma/       PrismaService (cliente gerado em src/generated, fora do git)
  auth/         cadastro, login, cookie selado (iron-session), @Viewer / @CurrentPilot
  sessions/     publicar, listar, abrir, visibilidade, links, apagar; canView
  app.ts        monta a aplicação (usado pelo servidor e pela exportação do OpenAPI)
  main.ts       sobe a porta e o Swagger em /docs
  openapi.ts    escreve openapi.json
prisma/
  schema.prisma, migrations/
```

A regra de acesso está em um lugar só: `canView`, em `sessions/visibility.ts`.
Sem permissão responde 404, nunca 403 — distinguir entregaria que a sessão existe.

## apps/web

Next.js com renderização no servidor. `src/lib/api.ts` concentra as chamadas à
api; as páginas só consomem.

## Testes

| App | Como se testa |
|---|---|
| desktop — domínio, decoder | chamada direta, sem mock |
| desktop — ingestão, análise, banco | SQLite `:memory:` real; `.ibt` e narrador falsos passados por parâmetro |
| desktop — IPC | handlers com barramento falso e banco real |
| desktop — nuvem | `openapi-fetch` real com `fetch` falso |
| desktop — `.ibt` real | lê `apps/desktop/fixtures/real/`, **pula** sem arquivo |
| api | regras puras (`canView`, senha); services contra Postgres ainda pendentes |

## O custo de trocar uma lib

| Trocar | Muda |
|---|---|
| Gemini → outro provedor | variável de ambiente |
| AI SDK → outra lib | `apps/desktop/src/main/analysis/` |
| SQLite → outro banco local | `apps/desktop/src/main/db/` e quem usa `LocalStore` |
| arquivo → memória compartilhada (fase 2) | outra implementação de `IbtFile` |
| Prisma/Postgres → outro | `apps/api/src/**/*.service.ts` |
| NestJS → outro framework | `apps/api` inteira; desktop e web só regeneram tipos se o contrato mudar |
| iron-session → outro esquema | `apps/api/src/auth/`; os clientes não tocam no cookie |

## Três decisões que sustentam o resto

### 1. O decoder é puro e a origem dos bytes é injetada

O decoder não abre arquivo: recebe uma `ByteSource`. O `.ibt` e o stream ao vivo
usam o mesmo header e a mesma tabela de variáveis — muda só de onde vêm os bytes.
Na fase 2, é outra fonte de bytes (ADR 0002).

### 2. A análise é determinística; o modelo só redige

Delta e tempo de volta saem do domínio, testável. O narrador recebe números
prontos. A conta fica certa, o custo cai e cada afirmação é rastreável até um
trecho e uns canais (ADR 0005, `docs/agente.md`).

### 3. O que roda local fica local por padrão

O watcher (ADR 0004) implica que a ingestão e a análise rodam na mesma máquina do
sim. O arquivo `.ibt` **nunca** sai dela, nem o caminho dele.

O que sobe é o derivado — metadados, condições, voltas e séries — e sobe
automaticamente, mas **nasce privado**: aparecer para outra pessoa exige ação do
piloto no painel da web (ADR 0013). Além disso, o resumo numérico que vai no
prompt do narrador sai para o provedor de LLM escolhido, e só ele.

## Catálogo de canais em runtime

Nunca existe lista fixa de canais: o catálogo é montado percorrendo a tabela de
variáveis do arquivo, porque o conjunto muda entre carros e builds do sim.

A exceção é explícita e verificada: os poucos canais **obrigatórios** para
recortar voltas (`Lap`, `LapDistPct`) estão declarados em
`apps/desktop/src/main/ingestion/ingest-file.ts` e são conferidos contra o
catálogo real do arquivo — ausência falha nomeando o canal, em vez de produzir
volta errada em silêncio.
