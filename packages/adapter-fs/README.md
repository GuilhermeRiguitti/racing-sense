# @telemetry/adapter-fs

Implementa as portas que precisam de disco. **Único dono de `node:fs`** —
`pnpm arch` reprova `node:*` em qualquer outro pacote de domínio ou aplicação.

| Arquivo | Porta | Estado |
|---|---|---|
| `file-telemetry-source.ts` | `TelemetryFilePort` | implementado |
| `telemetry-watcher.fs.ts` | `TelemetryWatcherPort` | stub; estratégia contra o file-lock documentada no arquivo e no ADR 0004 |
| `json-session-store.fs.ts` | `SessionReaderPort`/`SessionWriterPort` | stub; formato depende do ADR 0007 |

Quando os stubs virarem código, rodam a mesma suíte de contrato que o adapter em
memória já passa.
