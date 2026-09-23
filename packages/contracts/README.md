# @telemetry/contracts

DTOs e schemas da borda HTTP. **Único pacote onde `zod` aparece.**

Duas funções:

1. **Validar entrada na borda**, para id inventado não chegar ao caso de uso.
2. **Isolar o formato público** do modelo interno. Mudar um campo do domínio não
   quebra a API sem alguém passar por um mapper aqui e perceber.

O domínio não conhece schema de validação e a aplicação não conhece JSON. Trocar
zod por outra lib, ou JSON por outro formato, para neste pacote.
