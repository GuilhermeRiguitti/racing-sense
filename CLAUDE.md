# CLAUDE.md

Instruções para agentes de código neste repositório. Leia antes de escrever
qualquer linha.

## O projeto

Análise agêntica de telemetria do iRacing, em três aplicações:

| App | Framework | Onde roda | Papel |
|---|---|---|---|
| `apps/desktop` | Electron | Windows do piloto | ingestão, análise, LLM. **Offline-first** |
| `apps/cloud-api` | NestJS + Postgres | servidor | a ponte entre desktop e web |
| `apps/web` | Next.js | navegador | rede social: perfil, feed, voltas de outros |

**O desktop é o produto.** É o coach que o piloto deixa aberto enquanto treina:
dados sempre disponíveis, sempre atuais, bem apresentados. A web e a cloud-api
são funcionalidade extra — compartilhar volta, comparar com um amigo, perfil.

Critério para priorizar, sempre: *o piloto acabou de sair do carro e quer ver
onde perdeu tempo*. Entre melhorar o gráfico de delta e melhorar a consistência
da nuvem, **o gráfico ganha** (ADR 0017).

**E o desktop é a única origem de telemetria.** Ele lê o `.ibt` (e, na fase 2, o
SDK do iRacing). A cloud-api recebe dado **já processado**, guarda, devolve e
autentica. Isso não é convenção — é barreira de compilação: a cloud-api não
declara `@telemetry/application-desktop`, então o import nem resolve, e não tem
`node:fs` nos builtins, então não abre arquivo. Ver ADR 0011 e **ADR 0016**.

**Estado: o decoder lê arquivo real.** Arquitetura, regras e casos de uso estão de
pé. Desde 2026-09-19 o decoder abre um `.ibt` de verdade de ponta a ponta: header,
session info, catálogo de 288 canais e amostras em streaming, com os offsets
conferidos contra quatro arquivos (Ferrari 296 GT3 / Road Atlanta). O que ainda é
stub são os **algoritmos de análise** — recorte de voltas com histerese, delta e
narrador. Ver `docs/pendencias.md` e `docs/roadmap.md`.

## Comandos

```bash
pnpm install
pnpm check              # lint + arch + typecheck + testes — rode antes de dizer que terminou
pnpm arch               # só as fronteiras de arquitetura
pnpm test               # testes
pnpm typecheck          # tsc --noEmit em todos os workspaces
pnpm lint / lint:fix    # Biome
pnpm dev:desktop        # aplicativo do piloto (Electron)
pnpm dev:cloud          # cloud-api (NestJS), porta 4000
pnpm dev:web            # rede social (Next.js), porta 3000
```

Node 22+, pnpm 10+.

## A arquitetura (leia isto antes de criar qualquer arquivo)

Ports & adapters, dependência apontando para dentro. ADR 0009 e ADR 0010.

```
domain ◀── application (portas) ◀── adapters ◀── composition root (desktop | cloud-api)
```

| Camada | Pacote | Pode depender de |
|---|---|---|
| Domínio | `packages/domain` | **nada** |
| Núcleo da aplicação | `packages/application` | `domain` |
| Aplicação do desktop | `packages/application-desktop` | `application`, `domain` |
| Aplicação da nuvem | `packages/application-cloud` | `application`, `domain` |
| Borda (DTO + validação) | `packages/contracts` | `domain`, `zod` |
| Lib técnica | `packages/ibt-core` | **nada** |
| Adapters do desktop | `adapter-{ibt,fs,sqlite,http,llm}` | `application-desktop`, `domain` + a lib que possui |
| Adapter da nuvem | `adapter-postgres` | `application-cloud`, `domain`, `pg` |
| Composition roots | `apps/desktop`, `apps/cloud-api` | os adapters de **seu lado** |
| Interface web | `apps/web` | `contracts` |

**A separação `application-desktop` / `application-cloud` é a invariante central:**
ingestão, decodificação e análise só existem no lado do desktop. Um caso de uso
novo que toque em telemetria vai em `application-desktop`, sempre.

Cada adapter é dono de **uma** dependência: `better-sqlite3` em `adapter-sqlite`,
`pg` em `adapter-postgres`, `ai` em `adapter-llm`, `node:fs` em `adapter-fs`,
`zod` em `contracts`.

**`pnpm arch` reprova quem furar isso.** O mapa vive em
`scripts/architecture.config.mjs`; mudá-lo é mudar a arquitetura e pede ADR novo.

### Onde colocar código novo

| O que você está escrevendo | Onde vai |
|---|---|
| Regra de corrida (volta, delta, compatibilidade) | `domain` |
| Orquestração que toca em telemetria ("ingerir arquivo", "listar voltas", "comparar") | `application-desktop/commands` ou `/queries` |
| Orquestração da nuvem ("mudar visibilidade", "compartilhar", "listar públicas") | `application-cloud/commands` ou `/queries` |
| Relógio, id, erro que vale para os dois lados | `application` (núcleo) |
| "Preciso de algo que faça X" | uma porta no `application-*` do lado certo |
| Uso de lib externa ou API de plataforma | um adapter |
| Formato que sai na API | `contracts` |
| Escolha de qual implementação usar | `apps/desktop/src/main/composition-root.ts` ou `apps/cloud-api/src/composition-root.ts`, e só ali |
| Rota da cloud-api | `apps/cloud-api/src/modules/` — controller fino, módulo liga e não pensa |
| Canal novo entre front do desktop e o sistema | `apps/desktop/src/main/ipc-contract.ts` + handler |

Na dúvida, use a skill **`novo-caso-de-uso`**.

## Regras que não se quebram

Arquiteturais (as cinco primeiras são verificadas por `pnpm arch`):

1. **`domain` e `ibt-core` são puros.** Nada de `node:*`, nada de lib, nada de I/O.
2. **A aplicação não conhece implementação.** Caso de uso importa porta, nunca
   adapter. Quem escolhe é o composition root.
3. **Cada adapter é dono de uma dependência.** `zod` só em `contracts` (e a
   validação passa por `validate()` de lá), `ai` só em `adapter-llm`, `node:fs`
   só em `adapter-fs`, `better-sqlite3` só em `adapter-sqlite`, `pg` só em
   `adapter-postgres`.
4. **Sem import profundo.** `@telemetry/x` sim, `@telemetry/x/src/...` não.
5. **CQS.** Comando muda estado e devolve no máximo um id; query lê e não escreve.
   Query recebe só `...ReaderPort`. Gerar análise é comando (`RequestLapAnalysis`),
   ler o resultado é query (`GetLapAnalysis`).
6. **Porta estreita.** Uma capacidade por interface; leitura separada de escrita.
7. **Tipo de lib não atravessa porta.** Se `Buffer`, `Request` ou `LanguageModel`
   aparece numa assinatura de `application`, a lib vazou.
8. **Toda implementação de porta roda a suíte de contrato** do lado dela
   (`@telemetry/application-desktop/testing` ou `@telemetry/application-cloud/testing`).
   Adapter novo sem contrato verde não entra.

Da topologia (ADR 0011 e 0013):

9. **Só o desktop gera telemetria.** Ler `.ibt`, falar com o SDK do iRacing,
   decodificar e recortar voltas acontece **exclusivamente** no desktop. A
   cloud-api recebe dado já processado, guarda e devolve — ela não lê arquivo,
   não decodifica e não tem `node:fs`. Ver ADR 0016.
10. **O desktop nunca espera a nuvem.** Publicar é enfileirar; enviar é outro
    caso de uso, em segundo plano. Falha de rede não vira erro na cara do piloto.
11. **A LLM é só do desktop.** `adapter-llm` não entra na cloud-api nem na web.
12. **A web só fala com a cloud-api**, nunca com a máquina do piloto.
13. **Sessão nasce privada.** Como tudo sobe automaticamente, o default fechado é
    o único seguro. Acesso negado responde "não encontrada", nunca "sem
    permissão" — distinguir os dois entrega que a sessão existe.
14. **Nuvem desatualizada não é bug.** Divergência entre o banco local e o da
    nuvem é aceitável por design. **Não construa** reconciliação, versionamento
    de payload, resolução de conflito ou job de re-sincronização — se um dia
    fizer falta, é ADR novo. A única obrigação é apagar na nuvem o que o piloto
    apagou no desktop, e isso é privacidade, não sync (ADR 0017).

De domínio:

15. **Nunca mantenha catálogo fixo de canais.** Ele vem da tabela de variáveis em
    runtime. Canal obrigatório é declarado no caso de uso e conferido contra o
    catálogo real, falhando com o nome do canal.
16. **Session info é CP1252, não UTF-8.** UTF-8 corrompe nome com acento e passa
    despercebido até o primeiro acento aparecer.
17. **O modelo não calcula.** Delta, tempo de volta e recorte saem do domínio. O
    narrador recebe números prontos e redige.
18. **Comparação de volta é por distância (`lapDistPct`), nunca por tempo.**
19. **Condições da sessão viajam com a volta.** Comparar tempo sem temperatura de
    pista produz número honesto e conclusão errada.
20. **Chave de API só por variável de ambiente.** Nunca em código, teste, log ou
    commit.
21. **Nenhum `.ibt` no repositório.** São grandes e contêm dados de piloto.
22. **Stub lança `NotImplementedError`** dizendo o que falta. Stub que devolve
    valor falso vira bug silencioso.
23. **Leitura curta falha alto.** Nunca devolva buffer parcial: o sintoma aparece
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

Os offsets vêm da spec pública e da engenharia reversa da comunidade e **foram
validados contra arquivos reais em 2026-09-19** — ver `docs/formato-ibt.md`. O
teste que sustenta isso é `apps/desktop/src/main/ibt-real-file.test.ts`, que pula
quando não há fixture em `fixtures/real/` (nenhum `.ibt` entra no repositório,
regra 21). Se você mexer no decoder, ponha um arquivo lá antes de confiar no
verde: sem fixture, os testes provam só consistência interna.

## Ao mexer na interface do desktop

É o produto — o gráfico é o que o piloto olha depois de sair do carro. Antes de
escrever a primeira linha de gráfico, painel ou paleta, use a skill **`dataviz`**.

O renderer é um navegador sem Node: tudo que precisa de disco, rede ou chave
passa por IPC (`apps/desktop/src/main/ipc-contract.ts`).

**Evento é aviso, não dado.** O processo principal empurra `{ type, ids }` pelo
canal `events:desktop`; quem recebe responde **consultando de novo**. Payload de
evento nunca carrega série, volta ou relatório — senão passam a existir duas
versões da mesma verdade, e a que está na tela some no primeiro evento perdido.
Emitir evento nunca pode falhar um caso de uso: a porta é `void` e a ponte
engole o próprio erro.

## Ao tomar decisão estrutural

Use a skill **`novo-adr`**. ADR sem a seção "o que se aceita perder" é
propaganda, não registro. Mudança de ideia não edita ADR antigo — escreve um novo
que o supera.

## Testes

- Domínio: chamada direta, sem mock.
- Caso de uso: fake de porta escrito à mão (ver
  `packages/application-desktop/src/commands/*.test.ts`). Nada de mock de framework.
- Adapter: roda a suíte de contrato da porta.
- Teste que precisa de `.ibt` real lê de `fixtures/real/` e **pula** quando o
  arquivo não existe. Nunca falha por ausência de fixture.
- Antes de dizer que terminou: `pnpm check` verde. Se algo falhou, diga o que
  falhou.

## Commits

Conventional Commits em português:
`feat(domain): detecta voltas com histerese na linha de chegada`

Escopos: `domain`, `application`, `application-desktop`, `application-cloud`,
`contracts`, `ibt-core`, `adapter-ibt`, `adapter-fs`, `adapter-sqlite`,
`adapter-http`, `adapter-postgres`, `adapter-llm`, `adapter-memory`, `desktop`,
`cloud-api`, `web`, `docs`, `adr`, `infra`.

## Onde ler mais

| Documento | Para quê |
|---|---|
| `docs/arquitetura.md` | as camadas, o custo de trocar cada lib, como testar |
| `docs/adr/0009-arquitetura-hexagonal.md` | por que ports & adapters, e o que se aceitou perder |
| `docs/adr/0010-cqs-na-aplicacao.md` | a regra de comando vs. query |
| `docs/adr/0011-topologia-tres-aplicacoes.md` | as três aplicações e a fronteira de autonomia |
| `docs/adr/0012-electron-no-desktop.md` | por que Electron, e o que custa |
| `docs/adr/0013-sincronizacao-e-visibilidade.md` | publicação automática, visibilidade e links |
| `docs/adr/0014-autenticacao-iron-session.md` | um login para desktop e web |
| `docs/adr/0016-so-o-desktop-gera-telemetria.md` | a invariante central e as quatro barreiras |
| `docs/adr/0017-desktop-e-o-produto.md` | a prioridade: desktop primeiro, nuvem depois |
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

**Escopo da nuvem hoje:** esqueleto, e sem pressa. Postgres, migrations e
autenticação estão em `docs/pendencias.md`. O desktop funciona inteiro sem nada
disso, e é onde o esforço vai (ADR 0017).
