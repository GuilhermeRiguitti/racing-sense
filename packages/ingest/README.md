# @telemetry/ingest

Entrada dos bytes: I/O de arquivo, watcher da pasta do iRacing e, mais adiante,
cache do resultado do parse.

Este é o único pacote do lado do decoder que pode tocar em `node:fs`.
`@telemetry/ibt-core` continua puro.

## Estado

- `FileByteSource` — implementado.
- `createTelemetryWatcher` — stub. A estratégia contra o file-lock do Windows está
  escrita em `src/watcher.ts` e em `docs/adr/0004-ingestao-watcher-local.md`.
- Cache de parse — não começou. Ver `docs/adr/0007-persistencia-e-downsampling.md`.
