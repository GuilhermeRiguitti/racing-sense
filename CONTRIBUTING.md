# Como trabalhar neste repositório

## Ambiente

- Node 22+ (`.nvmrc`)
- pnpm 10+

```bash
pnpm install
pnpm check      # lint + arch + typecheck + testes. É o portão antes de qualquer commit.
```

Comandos úteis:

| Comando | O quê |
|---|---|
| `pnpm test` | testes uma vez |
| `pnpm test:watch` | testes em watch |
| `pnpm arch` | verifica as fronteiras entre camadas |
| `pnpm typecheck` | `tsc --noEmit` em todos os workspaces |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm dev:api` | API local em `http://localhost:3333` |
| `pnpm dev:web` | interface em `http://localhost:3000` |

## Idioma

- **Documentação, comentários, mensagens de commit e de erro:** português.
- **Código:** inglês. Nome de variável, função, tipo, arquivo e rota.

Misturar os dois dentro de um identificador (`calcularLapTime`) é o pior dos mundos.

## Regras de fronteira

Valem para pessoas e para agentes de código. Lista completa no `CLAUDE.md`,
justificativa nos ADRs 0009 e 0010.

1. **`domain` e `ibt-core` são puros** — sem `node:*`, sem lib, sem I/O.
2. **Caso de uso importa porta, nunca adapter.** Quem escolhe implementação é o
   composition root em `apps/api/src/composition-root.ts`.
3. **Cada adapter é dono de uma dependência externa** — `zod` em `contracts`,
   `ai` em `adapter-llm`, `node:fs` em `adapter-fs`, `hono` em `apps/api`.
4. **CQS**: comando muda estado e devolve no máximo um id; query lê e recebe só
   portas de leitura.
5. **Toda implementação de porta roda a suíte de contrato** de
   `@telemetry/application/testing`.
6. Nada de catálogo fixo de canais; session info é CP1252; comparação por
   distância; chave de API só por ambiente; nenhum `.ibt` versionado.

As quatro primeiras são verificadas por `pnpm arch` — violação quebra o build, não
depende de alguém lembrar na revisão. O mapa está em
`scripts/architecture.config.mjs`, e mudá-lo pede ADR.

## Testes

- Domínio: chamada direta, sem mock.
- Caso de uso: fake de porta escrito à mão. Nada de mock de framework.
- Adapter: roda a suíte de contrato da porta.
- Teste unitário de formato binário constrói os bytes na mão e roda em qualquer máquina.
- Teste que precisa de `.ibt` real lê de `fixtures/real/` e **pula** quando o arquivo
  não existe. Nunca falha por ausência de fixture.
- Stub declarado lança `NotImplementedError` com mensagem dizendo o que falta. Stub que
  devolve valor falso vira bug silencioso e some do radar.

## Commits

Conventional Commits, em português:

```
feat(domain): detecta voltas com histerese na linha de chegada
fix(adapter-fs): trata EBUSY ao abrir arquivo ainda travado pelo sim
docs(adr): registra escolha do provider de LLM
```

Escopos: `domain`, `application`, `contracts`, `ibt-core`, `adapter-ibt`,
`adapter-fs`, `adapter-llm`, `adapter-memory`, `api`, `web`, `docs`, `adr`, `infra`.

## Decisões

Decisão que custa caro para reverter vira ADR em `docs/adr/`. Mudança de ideia não
edita o ADR antigo — escreve um novo que o supera. Ver `docs/adr/README.md`.

## Antes de abrir PR

- [ ] `pnpm check` verde (inclui `pnpm arch`)
- [ ] Documentação atualizada se o comportamento mudou
- [ ] ADR novo se a decisão for estrutural
- [ ] Item resolvido saiu de `docs/pendencias.md`
