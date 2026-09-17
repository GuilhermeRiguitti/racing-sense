# @telemetry/agent

A camada agêntica: ferramentas sobre os dados de telemetria + um modelo que redige
a análise em cima delas.

## Princípio

**O modelo não calcula.** Delta, tempo de volta e detecção de trecho saem de
`@telemetry/analysis`, que é determinístico e testável. O modelo lê esses números,
escolhe o que importa e explica. Isso mantém a conta certa, o custo baixo e o
resultado auditável.

## Providers

`google` (Gemini Flash) por padrão, `nvidia` (NIM, endpoint compatível com OpenAI)
como alternativa. Trocar é mudar variável de ambiente — ver `src/config.ts` e
`docs/agente.md`.

## Estado

Configuração e resolução de provider implementadas. Ferramentas e o loop de análise
são stubs: dependem da `@telemetry/analysis` existir de verdade.
