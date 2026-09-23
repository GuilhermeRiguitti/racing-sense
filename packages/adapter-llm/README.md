# @telemetry/adapter-llm

Implementa `NarratorPort`. **Único dono de `ai` e `@ai-sdk/*`.**

O narrador recebe delta e trechos já calculados e devolve a redação. **Não
calcula nada** — ver `docs/agente.md` e o ADR 0005.

| Provider | Variável de ambiente | Default |
|---|---|---|
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash` |
| `nvidia` | `NVIDIA_API_KEY` | `meta/llama-3.3-70b-instruct` |

Trocar de provedor é `TELEMETRY_LLM_PROVIDER`. Trocar o AI SDK inteiro por outra
lib é reescrever este pacote — a aplicação só conhece a porta.

Sem chave configurada, o composition root usa um narrador que recusa trabalhar
com motivo explícito: a aplicação sobe, só a narração fica indisponível.
