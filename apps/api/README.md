# @telemetry/api

A rede social: cadastro e login, sessões que o desktop publicou, quem pode ver
cada uma e links de compartilhamento. NestJS + Prisma + Postgres.

```bash
pnpm install          # roda `prisma generate` no postinstall
pnpm db:deploy        # aplica as migrations (precisa de DATABASE_URL)
pnpm dev              # ou, da raiz: pnpm dev:api — http://localhost:4000
pnpm openapi          # escreve openapi.json (não precisa de banco)
```

Documentação navegável em **`/docs`** (Swagger UI) e o JSON em `/docs-json`.

## O que esta api não faz

Ela **não** lê arquivo de telemetria, **não** fala com o SDK do iRacing, **não**
decodifica nada, **não** recalcula nada e **não** roda modelo. Telemetria só
nasce no desktop (ADR 0016). E isso não depende de disciplina: o código do
decoder e da LLM não existe nesta aplicação (ADR 0020).

O que chega aqui é o `PublishSessionDto`: sessão, condições, voltas e séries —
tudo já processado pelo desktop, inclusive a melhor volta válida.

## O contrato

Os DTOs (`src/**/*.dto.ts`) são classes com `@ApiProperty` e `class-validator`:
o mesmo código valida a entrada e gera o OpenAPI. Mudou um DTO ou uma rota?
Rode `pnpm api:types` na raiz — desktop e web regeneram os tipos a partir do
`openapi.json`.

## Acesso

`canView` (`src/sessions/visibility.ts`) é o único lugar que decide quem vê uma
sessão. Sem permissão responde **404**, nunca 403: distinguir os dois entrega
que a sessão existe. Sessão nasce com a visibilidade padrão da conta, que é
`private`.

## Autenticação

Cookie selado com `iron-session`, emitido aqui e usado pela web e pelo desktop.
O `SESSION_SECRET` é obrigatório: sem ele o processo não sobe, porque servir com
sessão forjável é pior que não servir. Senha com `scrypt`.

## Build

Nest CLI com SWC (`nest build`), saída ESM em `dist/`. TypeScript 6, como
as outras apps: o Nest CLI ainda não roda com o 7.

`src/app.test.ts` monta a api inteira, sem banco: é o teste que pega um
`import type` numa classe injetada ou num DTO, que quebra a injeção ou desliga a
validação sem aviso.

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | conexão com o Postgres |
| `SESSION_SECRET` | segredo do cookie (mínimo 32 caracteres) |
| `PORT` | porta HTTP (padrão 4000) |
| `CORS_ORIGINS` | origens da web, separadas por vírgula (padrão `http://localhost:3000`) |
