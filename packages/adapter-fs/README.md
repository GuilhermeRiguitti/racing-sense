# @telemetry/adapter-fs

Implementa as portas que precisam de disco. **Único dono de `node:fs`** —
`pnpm arch` reprova `node:*` em qualquer outro pacote de domínio ou aplicação.

| Arquivo | Porta | Estado |
|---|---|---|
| `file-telemetry-source.ts` | `TelemetryFilePort` | implementado |
| `file-readiness.ts` | — (lógica interna) | implementado e testado sem disco |
| `telemetry-watcher.fs.ts` | `TelemetryWatcherPort` | implementado, com teste em arquivo real |
| `json-session-store.fs.ts` | `SessionReaderPort`/`SessionWriterPort` | não vai existir: o armazenamento local é SQLite (ADR 0015) |

## O problema que o watcher resolve

Não é formato — é *quando* o arquivo pode ser lido. Enquanto a sessão roda, o sim
mantém o `.ibt` aberto e o Windows o trava. Ler cedo demais dá uma de duas
coisas, e a segunda é pior:

- `EBUSY`/`EPERM` na abertura — barulhento, fácil de tratar;
- arquivo truncado com header válido — silencioso, vira volta errada.

Por isso `file-readiness.ts` espera o tamanho parar de crescer, tenta abrir, e
insiste enquanto o erro for de trava. Zero byte estável não conta como pronto, e
arquivo que nunca estabiliza vence por tempo com o motivo escrito — nunca some
em silêncio.

Essa lógica recebe `stat`, `open` e `wait` injetados, então o teste dela roda sem
disco e sem relógio. O `chokidar` fica numa casca fina por cima.
