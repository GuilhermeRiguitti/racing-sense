# @telemetry/api

Backend HTTP que roda **na máquina do piloto** (mesma que roda o iRacing), porque é
ela que enxerga `Documentos\iRacing\telemetry\`.

```bash
pnpm --filter @telemetry/api dev   # http://localhost:3333
```

## Papel na arquitetura

Este app é o **composition root**: `src/composition-root.ts` é o único arquivo do
sistema que escolhe implementações concretas. Todo o resto recebe portas.

```
src/
  composition-root.ts   liga portas a adapters — só aqui
  http/routes.ts        controllers finos: valida, chama UM caso de uso, devolve DTO
  http/error-handler.ts traduz erro de domínio em status HTTP, num lugar só
```

Regra de negócio dentro de rota é erro de camada. Se precisou de `if` sobre dado
de corrida no controller, aquilo é domínio ou caso de uso.

## Erros

| Código do domínio | HTTP |
|---|---|
| `NOT_FOUND` | 404 |
| `INVALID_REQUEST` | 400 |
| `INCOMPATIBLE_REFERENCE` | 409 |
| `MISSING_CHANNEL` | 422 |
| `NOT_IMPLEMENTED` | 501 |
| `INVARIANT_VIOLATED` | 500 |
