# @telemetry/desktop

O aplicativo do piloto. Roda no Windows, junto com o iRacing.

```bash
pnpm install
pnpm dev          # ou, da raiz: pnpm dev:desktop
pnpm test
pnpm api:types    # regenera src/main/cloud/api-schema.d.ts a partir de ../api/openapi.json
```

## Três runtimes, três responsabilidades

```
src/
  main/       Node — decoder, SQLite, watcher, análise, LLM, fila de publicação
    domain/     regras de corrida, sem I/O
    ibt/        decoder do .ibt e openIbtFile
    db/         LocalStore (SQLite)
    ingestion/  watcher → ingestTelemetryFile
    analysis/   comparação, referência, narrador
    cloud/      cliente da api (login, publicação)
    ipc/        handlers, DTOs, ponte de eventos
  preload/    ponte — expõe só os canais declarados em src/shared/ipc.ts
  renderer/   navegador — React + Vite, sem Node, sem fs, sem chave de API
  shared/     tipos do IPC e DTOs, usados pelos três
```

O renderer conversa com o `main` por **IPC**. Não existe servidor HTTP em
`localhost`: seria uma porta aberta na máquina do piloto sem nenhum ganho.

`ipc/handlers.ts` é a borda: lê a entrada, chama **uma** função, devolve DTO.
Erro de domínio vira `{ failed, code, message }`, porque `Error` não atravessa o
IPC com a classe intacta.

## Offline-first não é slogan

Ingestão, análise, comparação e LLM funcionam sem internet e sem a api. A
publicação entra numa fila persistida no SQLite e um flush em segundo plano tenta
enviar a cada minuto. Falha de rede deixa a sessão na fila — nunca vira erro na
cara do piloto.

## Segurança

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Uma falha no
front não vira acesso ao disco do piloto.

## Variáveis

| Arquivo | Versionado | Papel |
|---|---|---|
| `.env` | **não** | lido pelo processo principal, só em `pnpm dev` (no app empacotado vale o ambiente da máquina) |
| `.env.testing` | **não** | lido pelo vitest — e só ele; os testes nunca veem o `.env` |
| `.env.testing.example` | **sim** | modelo do `.env.testing`: declara as variáveis, todas vazias |

Em ambos, variável definida no terminal vence a do arquivo.

### `.env` — o aplicativo

Crie à mão; o git ignora. É onde mora a chave do provedor de LLM.

| Variável | Para quê |
|---|---|
| `TELEMETRY_API_URL` | endereço da api (padrão `http://localhost:4000`) |
| `TELEMETRY_DIRECTORY` | sobrescreve a pasta observada |
| `TELEMETRY_LLM_PROVIDER` e a chave do provedor | narrador (ver `docs/agente.md`) |

Variável que você não quer mudar fica fora do arquivo (ou comentada), não vazia:
`TELEMETRY_DIRECTORY=` vazio é uma pasta vazia, não "use o padrão".

### `.env.testing` — os testes

| Variável | Para quê |
|---|---|
| `TELEMETRY_FIXTURE` | caminho de um `.ibt` real, gravado pelo iRacing |

Não precisa criar à mão. Na primeira vez que `pnpm test` roda,
`scripts/testing-env.ts` copia o `.env.testing.example` para `.env.testing` e
procura a pasta `Documentos\iRacing\telemetry` (na pasta do usuário ou no
OneDrive). Achando, preenche `TELEMETRY_FIXTURE` com o `.ibt` mais recente.
Depois de criado, o script não mexe mais no arquivo; para refazer, apague-o.

**Para o teste de arquivo real funcionar, `TELEMETRY_FIXTURE` precisa estar
preenchida.** Vazia, o teste `src/main/ibt/ibt-real-file.test.ts` é pulado — e é
ele que prova que o decoder lê o formato de verdade (ver `docs/fixtures.md`). Se
o script não achou a pasta, ou escolheu um arquivo curto demais (o teste exige
ao menos uma volta completa), preencha à mão:

```
TELEMETRY_FIXTURE=C:/Users/<você>/Documents/iRacing/telemetry/<arquivo>.ibt
```

O `.env.testing.example` é versionado: **nunca ponha nele chave, token, senha
ou caminho** — só o nome da variável, vazia.
