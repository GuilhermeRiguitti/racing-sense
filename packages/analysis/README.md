# @telemetry/analysis

Detecção de voltas, normalização por distância, downsampling e comparação com a
volta de referência.

Tudo aqui é função pura sobre dados já decodificados. Sem I/O, sem HTTP, sem LLM —
isso mantém a análise testável com fixtures sintéticas, sem precisar de um `.ibt`.

## Estado

Assinaturas e armadilhas conhecidas documentadas; implementações são stubs.
É o próximo bloco de trabalho depois de validar o decoder contra um arquivo real.
