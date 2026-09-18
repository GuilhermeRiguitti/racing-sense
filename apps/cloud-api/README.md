# @telemetry/cloud-api

A ponte entre o aplicativo do Windows e a web: guarda o que o desktop publicou,
devolve para quem pode ver, e autentica os dois.

## O que esta API não faz, e não consegue fazer

Ela **não** lê arquivo de telemetria, **não** fala com o SDK do iRacing, **não**
decodifica nada e **não** roda modelo. Telemetria só nasce no desktop (ADR 0016).

Isso é barreira, não combinado:

| Barreira | Efeito |
|---|---|
| não declara `@telemetry/application-desktop` | o import da ingestão nem resolve |
| não declara `adapter-ibt`, `adapter-fs`, `ibt-core` | não há como decodificar |
| não declara `adapter-llm` | não há como chamar modelo |
| `builtins` sem `node:fs` | não há como abrir arquivo |

O que chega aqui é o DTO de `@telemetry/contracts`: sessão, condições, voltas e
séries — tudo já processado pelo desktop.

```bash
pnpm dev:cloud   # http://localhost:4000
```

## A regra que mantém o Nest honesto

**O módulo liga, não pensa.** O Nest tem injeção de dependência própria, que
competiria com o nosso composition root. Por isso:

- `composition-root.ts` monta adapters e casos de uso — é o único lugar que
  escolhe implementação;
- `app.module.ts` só tem `useFactory` chamando o composition root;
- controllers validam com os schemas de `@telemetry/contracts`, chamam **um**
  caso de uso e devolvem DTO.

Nenhum `@Injectable` com regra de negócio dentro. `pnpm arch` pegou uma violação
dessa regra durante a escrita deste app — o módulo estava criando o adapter de
Postgres sozinho.

## Autenticação

Cookie selado com `iron-session`, emitido aqui e usado pelas duas aplicações. O
`SESSION_SECRET` é obrigatório: sem ele o processo não sobe, porque servir com
sessão forjável é pior que não servir.

## Estado

Esqueleto. Rotas de visibilidade e compartilhamento existem; persistência em
Postgres, migrations e o middleware de sessão estão em `docs/pendencias.md`.

| Variável | Para quê |
|---|---|
| `SESSION_SECRET` | segredo do cookie (mínimo 32 caracteres) |
| `DATABASE_URL` | conexão com o Postgres |
| `PORT` | porta HTTP (padrão 4000) |
