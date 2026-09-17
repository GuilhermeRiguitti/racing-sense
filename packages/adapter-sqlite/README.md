# @telemetry/adapter-sqlite

Armazenamento local do app do Windows. **Único dono de `better-sqlite3`.**

| Porta | Estado |
|---|---|
| `SessionReaderPort` / `SessionWriterPort` | implementado, passa a suíte de contrato |
| `ReferenceLapReaderPort` / `ReferenceLapWriterPort` | idem |
| `PublicationQueuePort` | implementado, com testes próprios |

## Duas decisões do esquema

**Séries em JSON, não linha por ponto.** Uma volta tem milhares de pontos por
canal; linha por ponto viraria milhões de linhas para ganhar uma consulta que
ninguém faz — o acesso é sempre "me dá a série inteira desta volta".

**A fila de publicação mora aqui.** Ela precisa sobreviver a fechar o app e a
ficar sem internet; senão "publica tudo automaticamente" perderia justamente as
sessões feitas offline.

## Nota para o empacotamento

`better-sqlite3` é nativo: precisa de rebuild para a versão de Electron
(`electron-builder` faz isso). É o mesmo custo que a fase 2 já vai exigir pelo
addon do SDK do iRacing — pago uma vez.
