# Como trabalhar neste repositório

## Ambiente

- Node 22+ (`.nvmrc`)
- pnpm 10+

```bash
pnpm install
pnpm check      # lint + typecheck + testes. É o portão antes de qualquer commit.
```

Comandos úteis:

| Comando | O quê |
|---|---|
| `pnpm test` | testes uma vez |
| `pnpm test:watch` | testes em watch |
| `pnpm typecheck` | `tsc --noEmit` em todos os workspaces |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm dev:api` | API local em `http://localhost:3333` |
| `pnpm dev:web` | interface em `http://localhost:3000` |

## Idioma

- **Documentação, comentários, mensagens de commit e de erro:** português.
- **Código:** inglês. Nome de variável, função, tipo, arquivo e rota.

Misturar os dois dentro de um identificador (`calcularLapTime`) é o pior dos mundos.

## Regras de fronteira

Valem para pessoas e para agentes de código. A versão curta está no `CLAUDE.md`.

1. `@telemetry/ibt-core` não importa `node:*` e não tem dependência de runtime.
2. Nada de lista fixa de canais de telemetria. O catálogo vem da tabela de variáveis
   do arquivo, em runtime.
3. Session info é CP1252, não UTF-8.
4. Tipo de domínio que cruza processo mora em `@telemetry/contracts`, uma vez só.
5. Chave de API só por variável de ambiente.
6. Nenhum `.ibt` no repositório.

## Testes

- Teste unitário constrói os bytes na mão e roda em qualquer máquina.
- Teste que precisa de `.ibt` real lê de `fixtures/real/` e **pula** quando o arquivo
  não existe. Nunca falha por ausência de fixture.
- Stub declarado lança `NotImplementedError` com mensagem dizendo o que falta. Stub que
  devolve valor falso vira bug silencioso e some do radar.

## Commits

Conventional Commits, em português:

```
feat(analysis): detecta voltas com histerese na linha de chegada
fix(ingest): trata EBUSY ao abrir arquivo ainda travado pelo sim
docs(adr): registra escolha do provider de LLM
```

Escopos: `ibt-core`, `ingest`, `analysis`, `agent`, `contracts`, `api`, `web`, `docs`,
`adr`, `infra`.

## Decisões

Decisão que custa caro para reverter vira ADR em `docs/adr/`. Mudança de ideia não
edita o ADR antigo — escreve um novo que o supera. Ver `docs/adr/README.md`.

## Antes de abrir PR

- [ ] `pnpm check` verde
- [ ] Documentação atualizada se o comportamento mudou
- [ ] ADR novo se a decisão for estrutural
- [ ] Item resolvido saiu de `docs/pendencias.md`
