# @telemetry/adapter-memory

Implementações em memória das portas de armazenamento, mais relógio parado e
gerador de id sequencial.

É o único adapter que serve os dois lados — desktop e nuvem — porque só
implementa portas: ele nunca expõe um caso de uso de um lado para o outro.

Serve para dois usos: rodar o sistema antes de a persistência existir, e testar
caso de uso sem disco.

O arquivo de teste deste pacote não tem nenhum teste escrito à mão — ele roda as
suítes de contrato de `@telemetry/application-desktop/testing` e de
`@telemetry/application-cloud/testing`. Quando o adapter de disco
existir, ele roda exatamente as mesmas, e é assim que se sabe que um substitui o
outro sem tocar em caso de uso.
