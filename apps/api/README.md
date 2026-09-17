# @telemetry/api

Backend HTTP que roda **na máquina do piloto** (mesma que roda o iRacing), porque é
ela que enxerga `Documentos\iRacing\telemetry\`.

```bash
pnpm --filter @telemetry/api dev   # http://localhost:3333
```

Rotas ainda não implementadas respondem `501` com o pacote responsável no corpo.
