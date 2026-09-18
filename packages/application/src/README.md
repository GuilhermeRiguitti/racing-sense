# @telemetry/application

O núcleo compartilhado da camada de aplicação: o que vale para **qualquer**
aplicação do sistema.

- `ports/system.port.ts` — relógio e gerador de id. Injetados para que teste não
  dependa do relógio nem do acaso.
- `shared/errors.ts` — erro de orquestração comum.

## Por que é tão pouco

Porque os casos de uso **não** são compartilhados, de propósito:

| Pacote | Quem usa | O que tem |
|---|---|---|
| `@telemetry/application-desktop` | só o app do piloto | ingestão, decodificação, voltas, análise, publicação |
| `@telemetry/application-cloud` | só a cloud-api | visibilidade, compartilhamento, leitura do que foi publicado |

A cloud-api **não declara** `application-desktop`, então ela não consegue sequer
nomear a ingestão de telemetria. Não é convenção: é o pnpm recusando resolver o
import, e o `pnpm arch` reprovando a dependência. Ver
`docs/adr/0016-so-o-desktop-gera-telemetria.md`.
