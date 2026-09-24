# Como trabalhar neste repositório

## Ambiente

- Node 22+ (`.nvmrc`)
- pnpm 10.33 (cada app declara em `packageManager`)
- Postgres, só se for rodar a api com banco (`DATABASE_URL`)

```bash
pnpm install    # instala as três aplicações, cada uma com o próprio lockfile
pnpm check      # lint + typecheck + testes. É o portão antes de qualquer commit.
```

Comandos úteis na raiz:

| Comando | O quê |
|---|---|
| `pnpm test` | testes das três aplicações |
| `pnpm typecheck` | `tsc --noEmit` em cada aplicação |
| `pnpm lint` / `pnpm lint:fix` | ESLint, com o `eslint.config.js` de cada app |
| `pnpm dev:desktop` | aplicativo do piloto (Electron) |
| `pnpm dev:api` | api em `http://localhost:4000`, Swagger em `/docs` |
| `pnpm dev:web` | rede social em `http://localhost:3000` |
| `pnpm api:types` | exporta o `openapi.json` e regenera os tipos no desktop e na web |

Cada aplicação também roda sozinha: `cd apps/<app> && pnpm install && pnpm test`.

### Variáveis de ambiente

| App | Variável | Para quê |
|---|---|---|
| api | `DATABASE_URL` | Postgres (`postgresql://usuario:senha@host:5432/banco`) |
| api | `SESSION_SECRET` | segredo do cookie de login, mínimo 32 caracteres |
| api | `PORT` | porta HTTP (padrão 4000) |
| api | `CORS_ORIGINS` | origens da web autorizadas, separadas por vírgula (padrão `http://localhost:3000`) |
| web | `NEXT_PUBLIC_API_URL` | endereço da api (padrão `http://localhost:4000`) |
| desktop | `TELEMETRY_API_URL` | endereço da api (padrão `http://localhost:4000`) |
| desktop | `TELEMETRY_DIRECTORY` | sobrescreve a pasta observada |
| desktop | `TELEMETRY_LLM_PROVIDER`, `GOOGLE_GENERATIVE_AI_API_KEY`, `NVIDIA_API_KEY`, `TELEMETRY_LLM_MODEL` | narrador (ver `docs/agente.md`) |

## Idioma

- **Documentação, comentários, mensagens de commit e de erro:** português.
- **Código:** inglês. Nome de variável, função, tipo, arquivo e rota.

Misturar os dois dentro de um identificador (`calcularLapTime`) é o pior dos mundos.

## Regras de fronteira

Valem para pessoas e para agentes de código. Lista completa no `CLAUDE.md`,
justificativa no ADR 0020.

1. **Nenhuma aplicação importa código de outra.** O contrato é o OpenAPI da api.
2. **Dependência entra no `package.json` da aplicação que a usa.** A raiz não
   tem dependência nenhuma.
3. **Tudo do coach roda no desktop, sem HTTP**: ingestão, banco local, comparação
   e LLM. A api só entra para login e publicação, em segundo plano.
4. **`domain` e `ibt` do desktop são puros** — sem `node:*`, sem lib, sem I/O.
5. Nada de catálogo fixo de canais; session info é CP1252; comparação por
   distância; chave de API só por ambiente; nenhum `.ibt` versionado.

## Testes

- Domínio e decoder: chamada direta, sem mock.
- Desktop: SQLite `:memory:` real; `.ibt`, narrador e `fetch` falsos passados por
  parâmetro. Nada de mock de framework.
- Teste unitário de formato binário constrói os bytes na mão e roda em qualquer máquina.
- Teste que precisa de `.ibt` real lê de `apps/desktop/fixtures/real/` e **pula**
  quando o arquivo não existe. Nunca falha por ausência de fixture.
- Stub declarado lança `NotImplementedError` com mensagem dizendo o que falta. Stub que
  devolve valor falso vira bug silencioso e some do radar.

## Commits

Conventional Commits, em português:

```
feat(desktop): detecta voltas com histerese na linha de chegada
fix(desktop): trata EBUSY ao abrir arquivo ainda travado pelo sim
feat(api): rota de links de compartilhamento
docs(adr): registra escolha do provider de LLM
```

Escopos: `desktop`, `api`, `web`, `docs`, `adr`, `infra`.

## Decisões

Decisão que custa caro para reverter vira ADR em `docs/adr/`. Mudança de ideia não
edita o ADR antigo — escreve um novo que o supera. Ver `docs/adr/README.md`.

## Antes de abrir PR

- [ ] `pnpm check` verde
- [ ] `pnpm api:types` rodado, se a api mudou de contrato
- [ ] Documentação atualizada se o comportamento mudou
- [ ] ADR novo se a decisão for estrutural
- [ ] Item resolvido saiu de `docs/pendencias.md`
