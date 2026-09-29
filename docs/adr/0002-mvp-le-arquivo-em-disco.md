# ADR 0002 — MVP lê `.ibt` em disco; telemetria ao vivo fica para a fase 2

**Status:** Aceito · 2026-09-17 · Superado em parte por ADR 0023 (a leitura ao vivo entrou, sem addon compilado)

## Contexto

O iRacing expõe telemetria por dois caminhos: arquivos `.ibt` gravados em disco e uma
região de memória compartilhada atualizada a ~60 Hz enquanto o sim roda.

## Decisão

O MVP lê apenas arquivos `.ibt`.

## Por quê

O caminho ao vivo obriga a um addon nativo em C++ rodando na mesma máquina Windows com
o sim aberto: node-gyp, Python, Visual Studio Build Tools, rebuild a cada troca de
versão do Node e CI que não consegue testar a parte mais frágil do sistema.

Ler `.ibt` é decodificação de binário: roda em qualquer plataforma, testa em CI, sem
toolchain nativa.

E o trabalho não é jogado fora. O `.ibt` e o stream ao vivo usam **o mesmo header e a
mesma tabela de variáveis**. O decoder escrito agora é reaproveitado quase inteiro.

## O que se aceita perder

Nada de overlay em tempo real, nada de análise durante a sessão. O piloto sai do carro
e só então vê a análise.

## Consequência

`@telemetry/ibt-core` é puro e recebe uma `ByteSource` injetada. É essa decisão que faz
a fase 2 caber numa classe nova em vez de um rewrite.
