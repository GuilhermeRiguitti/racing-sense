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

Header, disk sub header, tabela de variáveis, session info (YAML em CP1252) e
leitura de amostras: tudo decodificado e testado.

Os offsets vêm da spec pública do SDK C++ e da engenharia reversa da comunidade
(ver `docs/formato-ibt.md`) e **foram validados contra oito arquivos reais**, em
dois carros com contagem de canais e tamanho de amostra diferentes. O teste que
sustenta isso é `apps/desktop/src/main/ibt-real-file.test.ts`, que pula quando não
há fixture.
