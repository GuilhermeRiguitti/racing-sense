# @telemetry/desktop

O aplicativo do piloto. Roda no Windows, junto com o iRacing.

```bash
pnpm dev:desktop
```

## Três runtimes, três responsabilidades

```
src/
  main/       Node — composition root, watcher, SQLite, fila de publicação
  preload/    ponte — expõe só os canais declarados em ipc-contract.ts
  renderer/   navegador — React + Vite, sem Node, sem fs, sem chave de API
```

O renderer conversa com o `main` por **IPC**. Não existe servidor HTTP em
`localhost`: seria uma porta aberta na máquina do piloto sem nenhum ganho
(ADR 0011).

`ipc-handlers.ts` é a borda, com a mesma regra dos controllers: valida, chama
**um** caso de uso, devolve DTO. Erro de domínio vira `{ failed, code, message }`,
porque `Error` não atravessa o IPC com a classe intacta.

## Offline-first não é slogan

Ingestão, análise, comparação e LLM funcionam sem internet. A publicação entra
numa fila persistida e um flush em segundo plano tenta enviar a cada minuto.
Falha de rede deixa a sessão na fila — nunca vira erro na cara do piloto.

## Segurança

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Uma falha no
front não vira acesso ao disco do piloto.
