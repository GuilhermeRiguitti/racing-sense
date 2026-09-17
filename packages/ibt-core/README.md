# @telemetry/ibt-core

Decoder puro do formato binário `.ibt` (iRacing telemetry).

É uma **biblioteca técnica**, não uma camada: não conhece o domínio nem a
aplicação. Quem a liga ao sistema é `@telemetry/adapter-ibt`, que implementa
`TelemetryDecoderPort` e traduz `VarHeader` em `ChannelDescriptor`.

## Contrato deste pacote

Três regras que não se quebram (ver `CLAUDE.md` na raiz):

1. **Zero I/O.** Nada de `fs`, `net`, `path` ou qualquer API de plataforma. Os bytes
   chegam por uma `ByteSource` injetada.
2. **Zero dependências de runtime.** Só TypeScript e `DataView`/`Uint8Array`.
   Nem `Buffer` — para o pacote rodar igual em Node, browser e worker.
3. **Nada específico de arquivo em disco vaza para a API.** O `.ibt` e a memória
   compartilhada (fase 2) compartilham header principal, tabela de variáveis e layout
   de amostra. O que é exclusivo de disco (`DiskSubHeader`) é opcional no modelo.

Consequência: quando a telemetria ao vivo entrar (fase 2), só se implementa uma nova
`ByteSource` sobre a memória compartilhada. Este pacote não muda.

## Estado

Header, disk sub header e tabela de variáveis: decodificados e testados
(consistência do layout aqui, e leitura de um `.ibt` sintético em
`@telemetry/adapter-ibt`). Session info (YAML em CP1252) e leitura de amostras
ainda são stubs.

⚠️ Os offsets vêm da spec pública do SDK C++ e da engenharia reversa da comunidade
(ver `docs/formato-ibt.md`). **Ainda não foram validados contra um `.ibt` real** —
essa é a pendência #1 do projeto.
