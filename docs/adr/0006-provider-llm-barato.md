# ADR 0006 — Gemini Flash como default, NVIDIA NIM como alternativa

**Status:** Aceito · 2026-09-17

## Contexto

A análise de uma volta gera várias chamadas de modelo. Se cada uma custar caro, o
produto não fecha para uso pessoal frequente.

## Decisão

Dois providers suportados, selecionados por variável de ambiente:

| Provider | Pacote | Chave |
|---|---|---|
| `google` (default) | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| `nvidia` | `@ai-sdk/openai-compatible` | `NVIDIA_API_KEY` |

O código só conhece o provider em `packages/agent/src/provider.ts`.

## Por quê

- Gemini Flash é barato, tem free tier e latência baixa — dá para iterar sem
  contabilidade mental a cada teste.
- NVIDIA NIM expõe endpoint compatível com OpenAI, então entra sem código novo: só
  `baseURL` + chave. Serve como escape se o Gemini mudar preço ou disponibilidade.
- A escolha é barata de mudar porque **o modelo não calcula nada** (ADR 0005 e
  `docs/agente.md`). Ele redige sobre números prontos, e isso modelo pequeno faz bem.

## O que se aceita perder

Modelo pequeno erra mais em raciocínio longo. Mitigação estrutural: a saída é validada
contra `agentReportSchema`, e achado sem canal de evidência é recusado na validação,
não no code review.

## Regra que não se quebra

Chave de API só por variável de ambiente. Nunca em código, teste, log ou commit.
