# ADR 0020 — Três aplicações independentes, sem código compartilhado

**Status:** Aceito · 2026-09-23 · supera o ADR 0009 e o ADR 0010, e supera em
parte o ADR 0001 (pacotes compartilhados e `catalog:`), o ADR 0011 (nome
`cloud-api`) e o ADR 0016 (as quatro barreiras)

## Contexto

O repositório tinha três aplicações em `apps/` e treze pacotes em `packages/`:
domínio, núcleo da aplicação, `application-desktop`, `application-cloud`,
`contracts`, `ibt-core` e sete adapters. Os pacotes eram consumidos como
TypeScript cru (`exports` apontando para `src/index.ts`). Por isso:

- o `electron-vite` precisava de uma lista de exclusão para empacotar os
  `@telemetry/*` no bundle do `main`;
- o `better-sqlite3`, declarado só pelo `adapter-sqlite`, precisava ser içado
  para a raiz (`publicHoistPattern`) para o `out/main` do desktop o achar;
- o Next precisava de `transpilePackages`;
- um `pnpm arch` verificava as regras de import entre os pacotes.

A estrutura existia para impor fronteiras: a api não podia importar a ingestão,
a aplicação não podia importar adapter, cada lib tinha um dono. O piloto (dono
do projeto) avaliou que o custo passou do benefício. Para entender onde fica
cada coisa, era preciso conhecer camadas, portas e composition roots. E um
caso de uso simples atravessava cinco pacotes.

## Decisão

**Cada aplicação é independente: o próprio `package.json`, o próprio lockfile,
o próprio `node_modules`, o próprio `tsconfig`. Nenhum código é compartilhado
entre elas.** `packages/` deixa de existir.

- **`apps/desktop`** absorve domínio, decoder `.ibt`, SQLite, watcher, análise e
  LLM, em pastas (`src/main/{domain,ibt,db,ingestion,analysis,cloud,ipc}`), **sem
  portas nem adapters**: as funções recebem o banco local (`LocalStore`) e
  chamam o SQLite e o disco direto. Tudo do coach roda sem HTTP.
- **`apps/cloud-api` vira `apps/api`**: NestJS padrão (módulos, services
  `@Injectable`, `ValidationPipe` com `class-validator`), **Prisma** sobre
  Postgres, e **Swagger** gerado pelo `@nestjs/swagger` em `/docs`.
- **O contrato entre as aplicações é o `openapi.json`** que a api exporta
  (`pnpm api:openapi`). Desktop e web geram os próprios tipos a partir dele
  (`openapi-typescript`) e chamam com `openapi-fetch`. Nenhuma importa código
  da outra.
- O workspace pnpm continua, só para rodar comandos em conjunto
  (`pnpm check`, `pnpm dev:*`), com `sharedWorkspaceLockfile: false`.

As decisões de produto dos ADRs anteriores continuam valendo: o desktop é a única
origem de telemetria (0016), a LLM roda no desktop, o desktop nunca espera a
nuvem, a sessão nasce privada (0013), SQLite local e Postgres no servidor (0015).

## Por quê

- **O isolamento que o `pnpm arch` verificava agora vem de graça, e mais forte.**
  A api não tem o código de decodificação entre as dependências dela — não é que o import
  seja proibido, é que não há o que importar. O mesmo vale para a LLM.
- **Build padrão de cada framework.** O Electron empacota as dependências
  normais do `package.json`; o Nest compila com o CLI; o Next não transpila
  pacote de fora. Some a lista de exclusão, o hoist e o `transpilePackages`.
- **Cada aplicação vira um container sem cirurgia.** Copiar a pasta e rodar
  `pnpm install --frozen-lockfile` funciona — foi testado para as três.
- **O desktop ficou mais fácil de ler.** Ingerir um arquivo é uma função em
  `ingestion/ingest-file.ts` que recebe o banco e o caminho. Antes eram um caso de
  uso, seis portas, três adapters e um composition root.
- **O contrato da api fica explícito e documentado**, em vez de ser um pacote
  TypeScript que só o repositório entendia.

## O que se aceita perder

- **Substituição de implementação por porta.** Trocar SQLite por outro banco no
  desktop agora mexe em quem usa `LocalStore`. Aceito porque essa troca não está
  no horizonte, e a porta cobrava cerimônia em todo caso de uso.
- **Testes com fake de porta.** Os testes do desktop usam SQLite `:memory:` de
  verdade e um `.ibt` falso injetado na ingestão. Ficaram mais realistas e um
  pouco mais lentos.
- **CQS verificado pelo compilador.** A separação entre ler e gerar continua no
  código (`getLapAnalysis` só lê, `requestLapAnalysis` gera), mas nada impede
  uma leitura de escrever. Vira disciplina, não barreira.
- **Duplicação consciente de tipos.** A regra de visibilidade (`canView`) mora só
  na api. Os DTOs existem duas vezes: nos DTOs da api e nos tipos gerados do
  OpenAPI de cada cliente. A geração mantém os dois alinhados, desde que alguém
  rode `pnpm api:types` quando a api mudar.
- **Os testes dos casos de uso da nuvem** (compartilhar, abrir por link) eram
  contra um store em memória. Os services da api falam com o Prisma e ainda não
  têm teste contra Postgres real — só `canView` e o hash de senha são testados.
  Está em `docs/pendencias.md`.
- **TypeScript 7.** O Nest CLI, o `openapi-typescript` e o `typescript-eslint`
  usam a API de compilador que o TypeScript 7.0 ainda não expõe. As três apps
  voltaram para o `typescript@^6` — o `tsc` fica mais lento que o do 7.
- **Formatação automática.** O Biome, que formatava e fazia lint, saiu; ficou
  só o ESLint padrão de cada framework, que não formata.

## Alternativa descartada

**Manter os pacotes e só simplificar a camada hexagonal do desktop.** Resolveria
a cerimônia do caso de uso, mas manteria o build com pacote em TypeScript cru e o
acoplamento de versões entre as três aplicações — que era a outra metade da
confusão.

**Prisma na web, com o Next falando direto com o Postgres.** Web e api passariam
a dividir banco e schema; a api ficaria só como porta de entrada do desktop.
Descartado: dois donos do mesmo banco é o acoplamento que esta decisão tira.

## Sinal para reverter

Se aparecer código de domínio que **precisa** ser idêntico em duas aplicações —
por exemplo, a web passar a calcular delta de volta no navegador — e a
duplicação começar a divergir, um pacote compartilhado volta a se pagar. Nesse
caso, um pacote publicado com build próprio, não TypeScript cru.
