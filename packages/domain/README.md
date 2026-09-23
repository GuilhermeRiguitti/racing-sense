# @telemetry/domain

Modelo e regras de corrida. **Zero dependências, zero I/O.**

Nada aqui sabe de arquivo, HTTP, banco ou LLM. Se a regra vale independente de
onde os dados vieram, ela é daqui.

## O que tem

| Módulo | O quê |
|---|---|
| `telemetry/` | canal, série, volta, sessão — e as invariantes de cada um |
| `reference/` | volta de referência e a regra de compatibilidade (mesma pista, mesmo carro) |
| `analysis/` | recorte de voltas, série por distância, delta, achados do narrador |
| `shared/` | erros de domínio e identificadores tipados |
| `testing/` | construtores de dado para teste, usados por todos os pacotes |

## Estado

Invariantes, regras de compatibilidade e os algoritmos (`detectLaps`,
`toDistanceSeries`, `downsample`, `compareToReference`) implementados e testados —
os três primeiros conferidos contra arquivo real. Falta a segmentação do delta em
trechos, que espera os setores da pista (pendência 7 em `docs/pendencias.md`).

## Por que ids são tipados

`SessionId` e `ReferenceLapId` são os dois `string`, mas o compilador recusa
trocar um pelo outro. Custa nada em runtime e mata a classe de bug mais chata de
achar: argumento na ordem errada entre dois ids.
