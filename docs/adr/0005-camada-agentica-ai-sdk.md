# ADR 0005 — AI SDK da Vercel como camada de modelo, em vez de Mastra

**Status:** Aceito · 2026-09-17

## Contexto

A camada agêntica entra no MVP. Duas opções consideradas: o AI SDK da Vercel (`ai`) e o
Mastra (`@mastra/core`), que é um framework de agentes construído **por cima** do
próprio AI SDK.

## Decisão

AI SDK (`ai` v7) direto, com `@ai-sdk/google` e `@ai-sdk/openai-compatible`.

## Por quê

O que este agente precisa fazer é estreito: chamar 4 ferramentas que leem dados já
calculados e produzir uma saída estruturada validada por zod. Isso é `generateObject` +
`tools`. Não há orquestração de múltiplos agentes, memória de longo prazo entre
sessões, nem workflow com estado.

O Mastra entrega exatamente o que ainda não é necessário — workflows, memória, storage,
evals, servidor próprio — e cobra em superfície de API e em acoplamento.

Como o Mastra roda sobre o AI SDK, começar pelo AI SDK não fecha a porta: as
ferramentas e os schemas são os mesmos dos dois lados.

## Quando reavaliar

Migre para Mastra quando aparecer pelo menos um destes:

- mais de um agente com papéis distintos precisando coordenar;
- memória de conversa persistida entre sessões do piloto;
- necessidade de evals versionados das respostas do agente;
- workflow com passos retomáveis (ingestão longa que pode falhar no meio).

## O que se aceita perder

Orquestração pronta. Se o escopo crescer, parte do que for escrito à mão aqui vira
trabalho jogado fora — o limite aceito é: no dia em que a orquestração virar código
nosso não trivial, a migração acontece.
