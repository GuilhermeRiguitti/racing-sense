# @telemetry/adapter-memory

Implementações em memória das portas de armazenamento, mais relógio parado e
gerador de id sequencial.

Serve para dois usos: rodar o sistema antes de a persistência existir, e testar
caso de uso sem disco.

O arquivo de teste deste pacote não tem nenhum teste escrito à mão — ele roda as
suítes de contrato de `@telemetry/application/testing`. Quando o adapter de disco
existir, ele roda exatamente as mesmas, e é assim que se sabe que um substitui o
outro sem tocar em caso de uso.
