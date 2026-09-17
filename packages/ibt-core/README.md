# @telemetry/ibt-core

Decoder puro do formato binário `.ibt` (iRacing telemetry).

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

Esqueleto. Os tipos, os offsets e as constantes do formato estão escritos e testados
quanto à consistência de tamanho; as funções de decodificação ainda são stubs.

⚠️ Os offsets vêm da spec pública do SDK C++ e da engenharia reversa da comunidade
(ver `docs/formato-ibt.md`). **Ainda não foram validados contra um `.ibt` real** —
essa é a pendência #1 do projeto.
