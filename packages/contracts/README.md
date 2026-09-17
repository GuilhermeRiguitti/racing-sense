# @telemetry/contracts

Schemas zod e tipos que atravessam fronteira entre `api`, `web` e `agent`.

Regra: um formato que cruza processo (HTTP, arquivo salvo, saída estruturada de
LLM) tem schema aqui, e a validação usa este schema — nos dois lados.
Tipo de domínio duplicado em outro pacote é bug, não atalho.
