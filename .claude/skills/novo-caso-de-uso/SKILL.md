---
name: novo-caso-de-uso
description: Roteiro para adicionar funcionalidade em uma das três aplicações independentes (desktop, api, web). Use ao criar uma operação do coach no desktop, um canal de IPC, uma rota ou tabela na api, uma página na web, ou ao adicionar uma biblioteca — e quando estiver em dúvida sobre em qual aplicação ou pasta um arquivo novo deve nascer.
---

# Funcionalidade nova

## Antes de escrever: responda duas perguntas

1. **Toca em telemetria, no `.ibt`, no banco local ou na LLM?** Então é do
   **desktop**, e roda sem HTTP (regras 6, 7 e 8 do CLAUDE.md).
2. **É social — conta, perfil, o que outros pilotos veem?** Então o dado mora na
   **api**, e desktop e web chegam nele por HTTP.

A web nunca é dona de regra nem de dado: ela mostra o que a api devolve.

## No desktop

| Passo | Onde |
|---|---|
| Regra de corrida (pura, sem I/O) | `src/main/domain/` + teste com chamada direta |
| Tabela ou consulta nova | `src/main/db/schema.ts` e `local-store.ts` |
| A operação | `src/main/{ingestion,analysis}/` — função que recebe o `LocalStore` (e o que mais precisar) |
| Canal para a tela | `src/shared/ipc.ts` (nome) → `src/main/ipc/handlers.ts` (handler) → `src/preload/index.ts` (exposição) → `src/renderer/src/bridge.ts` (tipo) |
| DTO para a tela | tipo em `src/shared/dto.ts`, mapper em `src/main/ipc/dto.ts` |

Forma da operação:

```ts
export function importReferenceLap(store: LocalStore, request: ImportReferenceLapRequest): ReferenceLapId
export async function requestLapAnalysis(ctx: AnalysisContext, request: LapAgainstReference): Promise<void>
```

- Sem classe e sem interface de "porta": o `LocalStore` é o SQLite de verdade.
- O que o teste precisa trocar (arquivo, modelo, `fetch`) entra como parâmetro.
- Gerar e ler são funções separadas: tela que abre não pode disparar modelo.
- Teste: `openLocalStore(':memory:')`, sem mock de framework.

Se a operação precisa avisar a tela, emita um evento **depois** de gravar, com
só os ids (`{ type, ids }`); a tela consulta de novo.

## Na api

1. DTO em `src/<módulo>/<módulo>.dto.ts`: classe com `@ApiProperty` (tipo
   explícito em campo anulável ou array) e `class-validator`.
2. Service `@Injectable` com o `PrismaService`. Acesso negado → `NotFoundException`,
   nunca 403 (regra 10). Visibilidade só por `canView`.
3. Controller fino com `@ApiOkResponse`/`@ApiNoContentResponse`, e `PilotGuard` +
   `@CurrentPilot()` quando exige login.
4. Tabela nova: `prisma/schema.prisma` + `pnpm --dir apps/api db:migrate`.
5. Na raiz: `pnpm api:types`, para desktop e web enxergarem o contrato novo.

## Na web

Chamada nova em `src/lib/api.ts` com o cliente gerado; a página só consome.
Imports sem extensão (convenção do Next).

## Biblioteca nova

Entra no `package.json` **da aplicação que usa**, e em nenhum outro lugar. Se ela
roda script de instalação, acrescente o nome em `pnpm.onlyBuiltDependencies` do
`package.json` da app **e** em `onlyBuiltDependencies` do `pnpm-workspace.yaml`.

## Antes de dizer que terminou

`pnpm check` na raiz, verde.
