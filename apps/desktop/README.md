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

| Variável | Para quê |
|---|---|
| `TELEMETRY_API_URL` | endereço da api (padrão `http://localhost:4000`) |
| `TELEMETRY_DIRECTORY` | sobrescreve a pasta observada |
| `TELEMETRY_LLM_PROVIDER` e a chave do provedor | narrador (ver `docs/agente.md`) |
