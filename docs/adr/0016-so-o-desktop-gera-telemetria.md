# ADR 0016 — Só o desktop gera telemetria

**Status:** Aceito · 2026-09-17
**Refina:** ADR 0011 (topologia das três aplicações)

## Contexto

A topologia do ADR 0011 já dizia que a análise mora no desktop. Mas dizer não
basta: `@telemetry/application` exportava a ingestão, o decoder e as portas de
arquivo para **qualquer** pacote que o declarasse — e a cloud-api declarava.
Ninguém usava, e nada impedia.

A cloud-api também podia usar `node:fs`: abrir um `.ibt` na mão estava a um
import de distância.

Com o tempo, essa distância é percorrida. Alguém precisa de um reprocessamento,
a API já tem o arquivo, e de repente existe um segundo lugar que decodifica
telemetria — com outra versão do decoder, outra regra de volta, outro resultado.

## Decisão

**O aplicativo do desktop é o core do sistema e a única origem de dado de
telemetria.** Ele lê o `.ibt` que o iRacing grava e, na fase 2, falará com o SDK.

**A cloud-api é um gateway de persistência e autenticação.** Ela recebe dado
**já processado**, guarda, devolve, e autentica desktop e web. Não lê arquivo do
sim, não fala com o SDK, não decodifica nada, não roda modelo.

**A web lê da cloud-api.** Nada além disso.

## Como isso deixou de ser convenção

`@telemetry/application` foi quebrado em três:

| Pacote | Quem declara | O que tem |
|---|---|---|
| `@telemetry/application` | todos | relógio, gerador de id, erro comum |
| `@telemetry/application-desktop` | só o desktop e seus adapters | ingestão, decodificação, voltas, análise, publicação |
| `@telemetry/application-cloud` | só a cloud-api e o adapter de Postgres | visibilidade, compartilhamento, leitura do publicado |

Como a cloud-api não declara `application-desktop`, o pnpm nem instala o pacote
para ela: o import falha na resolução, antes de qualquer revisão de código.

E `builtins` no mapa de camadas deixou de ser "pode ou não pode usar `node:*`" e
passou a ser a lista de módulos permitidos. A cloud-api tem `node:crypto` e
`node:http`. **Não tem `node:fs`** — ela não consegue abrir arquivo nenhum.

As quatro barreiras, verificadas por `pnpm arch` (e as três primeiras também
pelo próprio TypeScript):

1. `application-desktop` fora da lista de pacotes da nuvem;
2. `adapter-ibt`, `adapter-fs` e `ibt-core` fora também;
3. `adapter-llm` fora — modelo roda na máquina de quem pediu;
4. `node:fs` fora dos builtins da nuvem.

## O que a nuvem recebe

O DTO de `@telemetry/contracts`: metadados da sessão, condições, voltas
recortadas e séries já normalizadas. Nada de bytes de `.ibt`. Se um dia a API
precisar de algo que só existe no arquivo, a resposta certa é **o desktop
calcular e enviar**, não a API aprender a ler arquivo.

## O que se aceita perder

- **Reprocessar no servidor deixa de ser possível.** Se o algoritmo de recorte de
  voltas melhorar, as sessões antigas só se atualizam quando o desktop do piloto
  reprocessar e republicar. É o custo de ter uma única origem de verdade.
- **Três pacotes de aplicação onde havia um**, e um `package.json` a mais para
  manter em cada mudança de porta compartilhada.
- **Alguma duplicação de leitura**: a nuvem precisa de resumos (melhor volta,
  contagem) que o desktop já calculou; eles viajam no DTO em vez de serem
  derivados de novo.

## Alternativa descartada

**Manter um pacote só e confiar na disciplina**, documentando que a nuvem não
deve importar a ingestão. É exatamente o estado anterior — e a razão deste ADR
existir é que ele durou até alguém precisar reler o arquivo no servidor.
