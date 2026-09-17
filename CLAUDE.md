# CLAUDE.md

Instruções para agentes de código neste repositório. Leia antes de escrever qualquer
linha.

## O projeto

Análise agêntica de telemetria do iRacing. Lê arquivos `.ibt` gravados em disco pelo
sim, recorta as voltas, compara com uma volta de referência importada e usa um agente de
LLM para explicar onde o tempo foi perdido.

**Estado: fundação.** A estrutura e as regras estão de pé. O decoder tem tipos,
constantes de formato e testes de consistência — mas **nenhum `.ibt` real passou por ele
ainda**. Ver `docs/pendencias.md`.

## Comandos

```bash
pnpm install
pnpm check              # lint + typecheck + testes — rode antes de dizer que terminou
pnpm test               # testes
pnpm typecheck          # tsc --noEmit em todos os workspaces
pnpm lint / lint:fix    # Biome
pnpm dev:api            # API local, porta 3333
pnpm dev:web            # interface, porta 3000
```

Node 22+, pnpm 10+.

## Estrutura

| Pacote | Responsabilidade | Pode importar |
|---|---|---|
| `packages/ibt-core` | decoder binário puro | **nada** |
| `packages/ingest` | I/O de arquivo, watcher | `node:fs`, `chokidar`, `ibt-core` |
| `packages/analysis` | voltas, séries, delta | `contracts`, `ibt-core` |
| `packages/contracts` | schemas zod compartilhados | `zod` |
| `packages/agent` | ferramentas + LLM | `ai`, `analysis`, `contracts` |
| `apps/api` | HTTP local | tudo acima |
| `apps/web` | Next.js | `contracts` |

Dependência nunca aponta para trás.

## Regras que não se quebram

1. **`@telemetry/ibt-core` é puro.** Nada de `node:*`, nada de `Buffer`, nenhuma
   dependência de runtime. Os bytes chegam por uma `ByteSource` injetada. É essa regra
   que faz a telemetria ao vivo (fase 2) caber numa classe nova em vez de um rewrite —
   ver `docs/adr/0002-mvp-le-arquivo-em-disco.md`.
2. **Nunca liste canais de telemetria no código.** O catálogo se monta em runtime
   percorrendo a tabela de variáveis do arquivo. O conjunto muda entre carros e entre
   builds do sim.
3. **Session info é CP1252, não UTF-8.** Parsear como UTF-8 corrompe nome de piloto com
   acento — e passa despercebido até aparecer o primeiro acento.
4. **O modelo não calcula.** Delta, tempo de volta e recorte de trecho saem de
   `@telemetry/analysis`, que é determinística e testada. O agente lê números prontos e
   redige. Ver `docs/agente.md`.
5. **Comparação de volta é por distância (`lapDistPct`), nunca por tempo.**
6. **Tipo de domínio que cruza processo mora em `@telemetry/contracts`**, uma vez só,
   validado com o schema dos dois lados.
7. **Chave de API só por variável de ambiente.** Nunca em código, teste, log ou commit.
8. **Nenhum `.ibt` no repositório.** São grandes e contêm dados de piloto. Ver
   `docs/fixtures.md`.
9. **Stub lança `NotImplementedError`** com o que falta na mensagem. Stub que devolve
   valor falso vira bug silencioso.
10. **Leitura curta falha alto.** Nunca devolva buffer parcial: o sintoma aparece longe
    da causa.

## Idioma

- Documentação, comentários, mensagens de commit e de erro: **português**.
- Código (identificadores, arquivos, rotas): **inglês**.

Nunca misture dentro de um identificador.

## Ao trabalhar no decoder

Use a skill **`ibt-format`** — ela tem offsets, tipos e o roteiro de diagnóstico para
quando um valor vier absurdo. As constantes estão em `packages/ibt-core/src/format.ts`;
use-as, não redigite números.

Os offsets vêm da spec pública e da engenharia reversa da comunidade, e ainda **não
foram validados contra um arquivo real**. Os testes atuais provam consistência interna,
não correção. Trate como hipótese testável.

## Ao tomar decisão estrutural

Use a skill **`novo-adr`**. ADR sem a seção "o que se aceita perder" é propaganda, não
registro. Mudança de ideia não edita ADR antigo — escreve um novo que o supera.

## Testes

- Unitário constrói os bytes na mão (ver `packages/ibt-core/src/decoder.test.ts`) e roda
  em qualquer máquina.
- Teste que precisa de `.ibt` real lê de `fixtures/real/` e **pula** quando o arquivo não
  existe. Nunca falha por ausência de fixture.
- Antes de dizer que terminou: `pnpm check` verde. Se algo falhou, diga o que falhou.

## Commits

Conventional Commits em português:
`feat(analysis): detecta voltas com histerese na linha de chegada`

Escopos: `ibt-core`, `ingest`, `analysis`, `agent`, `contracts`, `api`, `web`, `docs`,
`adr`, `infra`.

## Onde ler mais

| Documento | Para quê |
|---|---|
| `docs/arquitetura.md` | como as peças se encaixam e por quê |
| `docs/formato-ibt.md` | o layout binário, campo a campo |
| `docs/agente.md` | o que o agente faz e o que ele não faz |
| `docs/roadmap.md` | etapas e critério de pronto |
| `docs/pendencias.md` | o que ainda não foi decidido ou validado |
| `docs/adr/` | decisões estruturais |
| `docs/glossario.md` | termos de telemetria de corrida |
| `docs/referencia-inicial.md` | documento que originou o projeto |
| `CONTRIBUTING.md` | ambiente e fluxo de trabalho |

## Escopo

**MVP:** ler `.ibt` em disco, recortar voltas, comparar com referência, gráficos e
relatório do agente.

**Fora do MVP:** telemetria ao vivo via memória compartilhada, overlay em tempo real,
broadcast de comandos para o sim. Não implemente — a arquitetura já deixa o caminho
pronto, e antecipar isso custa addon nativo, node-gyp e CI que não testa.
