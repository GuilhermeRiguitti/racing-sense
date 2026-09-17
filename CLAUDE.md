# CLAUDE.md

Instruções para agentes de código neste repositório. Leia antes de escrever
qualquer linha.

## O projeto

Análise agêntica de telemetria do iRacing. Lê arquivos `.ibt` gravados em disco
pelo sim, recorta as voltas, compara com uma volta de referência e usa um agente
de LLM para explicar onde o tempo foi perdido.

**Estado: fundação.** Arquitetura, regras e casos de uso estão de pé. O decoder
tem tipos, constantes e catálogo de canais funcionando — mas **nenhum `.ibt` real
passou por ele ainda**, e os algoritmos de análise são stubs. Ver
`docs/pendencias.md` e `docs/roadmap.md`.

## Comandos

```bash
pnpm install
pnpm check              # lint + arch + typecheck + testes — rode antes de dizer que terminou
pnpm arch               # só as fronteiras de arquitetura
pnpm test               # testes
pnpm typecheck          # tsc --noEmit em todos os workspaces
pnpm lint / lint:fix    # Biome
pnpm dev:api            # API local, porta 3333
pnpm dev:web            # interface, porta 3000
```

Node 22+, pnpm 10+.

## A arquitetura (leia isto antes de criar qualquer arquivo)

Ports & adapters, dependência apontando para dentro. ADR 0009 e ADR 0010.

```
domain  ◀── application (portas) ◀── adapters ◀── apps/api (composition root)
```

| Camada | Pacote | Pode depender de |
|---|---|---|
| Domínio | `packages/domain` | **nada** |
| Aplicação | `packages/application` | `domain` |
| Borda (DTO) | `packages/contracts` | `domain`, `zod` |
| Lib técnica | `packages/ibt-core` | **nada** |
| Adapters | `packages/adapter-{ibt,fs,llm,memory}` | `application`, `domain` + a lib que aquele adapter possui |
| Composition root | `apps/api` | tudo acima |
| Interface | `apps/web` | `contracts` |

**`pnpm arch` reprova quem furar isso.** O mapa vive em
`scripts/architecture.config.mjs`; mudá-lo é mudar a arquitetura e pede ADR novo.

### Onde colocar código novo

| O que você está escrevendo | Onde vai |
|---|---|
| Regra de corrida (volta, delta, compatibilidade) | `domain` |
| Orquestração de um fluxo ("ingerir arquivo", "listar voltas") | `application/commands` ou `application/queries` |
| "Preciso de algo que faça X" | uma porta em `application/ports` |
| Uso de lib externa ou API de plataforma | um adapter |
| Formato que sai na API | `contracts` |
| Escolha de qual implementação usar | `apps/api/src/composition-root.ts`, e só ali |

Na dúvida, use a skill **`novo-caso-de-uso`**.

## Regras que não se quebram

Arquiteturais (as quatro primeiras são verificadas por `pnpm arch`):

1. **`domain` e `ibt-core` são puros.** Nada de `node:*`, nada de lib, nada de I/O.
2. **A aplicação não conhece implementação.** Caso de uso importa porta, nunca
   adapter. Quem escolhe é o composition root.
3. **Cada adapter é dono de uma dependência.** `zod` só em `contracts`, `ai` só em
   `adapter-llm`, `node:fs` só em `adapter-fs`, `hono` só em `apps/api`.
4. **Sem import profundo.** `@telemetry/x` sim, `@telemetry/x/src/...` não.
5. **CQS.** Comando muda estado e devolve no máximo um id; query lê e não escreve.
   Query recebe só `...ReaderPort`. Gerar análise é comando (`RequestLapAnalysis`),
   ler o resultado é query (`GetLapAnalysis`).
6. **Porta estreita.** Uma capacidade por interface; leitura separada de escrita.
7. **Tipo de lib não atravessa porta.** Se `Buffer`, `Request` ou `LanguageModel`
   aparece numa assinatura de `application`, a lib vazou.
8. **Toda implementação de porta roda a suíte de contrato**
   (`@telemetry/application/testing`). Adapter novo sem contrato verde não entra.

De domínio:

9. **Nunca mantenha catálogo fixo de canais.** Ele vem da tabela de variáveis em
   runtime. Canal obrigatório é declarado no caso de uso e conferido contra o
   catálogo real, falhando com o nome do canal.
10. **Session info é CP1252, não UTF-8.** UTF-8 corrompe nome com acento e passa
    despercebido até o primeiro acento aparecer.
11. **O modelo não calcula.** Delta, tempo de volta e recorte saem do domínio. O
    narrador recebe números prontos e redige.
12. **Comparação de volta é por distância (`lapDistPct`), nunca por tempo.**
13. **Chave de API só por variável de ambiente.** Nunca em código, teste, log ou
    commit.
14. **Nenhum `.ibt` no repositório.** São grandes e contêm dados de piloto.
15. **Stub lança `NotImplementedError`** dizendo o que falta. Stub que devolve
    valor falso vira bug silencioso.
16. **Leitura curta falha alto.** Nunca devolva buffer parcial: o sintoma aparece
    longe da causa.

## Forma de um caso de uso

```ts
export interface XCommand { /* entrada */ }
export interface XDeps { /* portas */ }
export type XHandler = (command: XCommand) => Promise<Id | void>;

export function createXHandler(deps: XDeps): XHandler { /* ... */ }
```

Fábrica que recebe portas e devolve o handler. Sem classe, sem container de DI,
sem decorator — a injeção é o argumento da função.

## Idioma

- Documentação, comentários, mensagens de commit e de erro: **português**.
- Código (identificadores, arquivos, rotas): **inglês**.

Nunca misture dentro de um identificador.

## Ao trabalhar no decoder

Use a skill **`ibt-format`**: offsets, tipos e roteiro de diagnóstico para quando
um valor vier absurdo. As constantes estão em `packages/ibt-core/src/format.ts` —
use-as, não redigite números.

Os offsets vêm da spec pública e da engenharia reversa da comunidade e **ainda
não foram validados contra um arquivo real**. Os testes provam consistência
interna, não correção.

## Ao tomar decisão estrutural

Use a skill **`novo-adr`**. ADR sem a seção "o que se aceita perder" é
propaganda, não registro. Mudança de ideia não edita ADR antigo — escreve um novo
que o supera.

## Testes

- Domínio: chamada direta, sem mock.
- Caso de uso: fake de porta escrito à mão (ver
  `packages/application/src/commands/*.test.ts`). Nada de mock de framework.
- Adapter: roda a suíte de contrato da porta.
- Teste que precisa de `.ibt` real lê de `fixtures/real/` e **pula** quando o
  arquivo não existe. Nunca falha por ausência de fixture.
- Antes de dizer que terminou: `pnpm check` verde. Se algo falhou, diga o que
  falhou.

## Commits

Conventional Commits em português:
`feat(domain): detecta voltas com histerese na linha de chegada`

Escopos: `domain`, `application`, `contracts`, `ibt-core`, `adapter-ibt`,
`adapter-fs`, `adapter-llm`, `adapter-memory`, `api`, `web`, `docs`, `adr`,
`infra`.

## Onde ler mais

| Documento | Para quê |
|---|---|
| `docs/arquitetura.md` | as camadas, o custo de trocar cada lib, como testar |
| `docs/adr/0009-arquitetura-hexagonal.md` | por que ports & adapters, e o que se aceitou perder |
| `docs/adr/0010-cqs-na-aplicacao.md` | a regra de comando vs. query |
| `docs/formato-ibt.md` | o layout binário, campo a campo |
| `docs/agente.md` | o que o agente faz e o que ele não faz |
| `docs/roadmap.md` | etapas e critério de pronto |
| `docs/pendencias.md` | o que ainda não foi decidido ou validado |
| `docs/glossario.md` | termos de telemetria de corrida |
| `docs/referencia-inicial.md` | documento que originou o projeto |
| `CONTRIBUTING.md` | ambiente e fluxo de trabalho |

## Escopo

**MVP:** ler `.ibt` em disco, recortar voltas, comparar com referência, gráficos
e relatório do agente.

**Fora do MVP:** telemetria ao vivo via memória compartilhada, overlay em tempo
real, broadcast de comandos para o sim. Não implemente — quando entrar, é um
adapter novo de `TelemetryFilePort` e nada mais muda.
