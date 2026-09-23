# ADR 0007 — Persistência e downsampling

**Status:** Superado por ADR 0019 na parte de gravação · 2026-09-17 · medido em 2026-09-22

> A decisão de manter o `.ibt` como fonte da verdade e de reduzir com min/max
> por balde continua valendo. O que o ADR 0019 supera é **o que se grava**: a
> grade de um ponto por metro e o custo declarado do `Float32`, que era falso.

## Contexto

Uma stint de 30 minutos a 60 Hz passa de 100 mil amostras por canal, com dezenas de
canais. Um gráfico de 1200 px mostra, na prática, ~1200 pontos. Reparsear o mesmo
arquivo a cada visualização é desperdício conhecido — o `iracing-telemetry-analyzer`
persiste o resultado do parse em disco exatamente por isso.

Duas estratégias:

1. **Guardar cru, agregar na leitura.** Nada de informação se perde; cada consulta
   paga o custo.
2. **Reduzir na ingestão.** Leitura barata; o que foi descartado não volta.

## Decisão

Caminho híbrido:

- o `.ibt` original permanece no disco do piloto e é a fonte da verdade;
- a ingestão persiste um **derivado por volta** (séries normalizadas por `lapDistPct`,
  em resolução alta o suficiente para análise);
- a UI recebe séries reduzidas sob demanda a partir desse derivado;
- reprocessar do original é sempre possível, porque ele não é descartado.

Só viraria `Aceito` depois de medir o tamanho do derivado com um arquivo real.
**Foi medido** — ver "Como ficou".

## Downsampling

Redução por média simples achata picos de frenagem — justamente o que o piloto quer
ver. O alvo é um algoritmo que preserve extremos: LTTB ou min/max por bucket.

O delta **nunca** é calculado sobre série reduzida. Reduz-se para desenhar, não para
contar.

## Em aberto

Formato de persistência do derivado (SQLite? Parquet? JSON comprimido?) e política de
retenção. Ver `docs/pendencias.md`.

## Como ficou (2026-09-22)

Medido com um arquivo real de Road Atlanta (16,87 MB, três voltas), rodando a
ingestão de verdade contra o SQLite: **150 ms** de ponta a ponta.

### A resolução não é um número redondo, é um metro

A proposta dizia "na ordem de 1000 pontos por volta". A medição reprovou: a 60 Hz
um GT3 gera uma amostra a cada 0,23 a 1,17 m, então mil pontos dariam 4,06 m por
ponto em Road Atlanta e 5,75 m em Suzuka — seis a oito vezes mais grosso que o
dado bruto, num sistema cuja frase-produto é "você freou 12 m mais tarde".

A grade é **um ponto por metro**, derivada do `TrackLength` do próprio arquivo.
Isso resolve de quebra um problema que o número fixo tinha: com mil pontos, uma
pista curta ganharia resolução exagerada e uma longa ficaria grossa.

### O derivado é binário, não JSON

| | JSON | Binário |
|---|---|---|
| Uma volta | 616 KB | **79 KB** |
| Stint de 20 voltas | 12,03 MB | **1,55 MB** |
| 100 stints | 1,18 GB | **0,15 GB** |

Duas mudanças dão as 7,8x: o eixo `x` **não é gravado** (é uma grade uniforme —
guardar é guardar uma conta) e `y` vira `Float32` em vez de texto decimal.

1,18 GB para uma temporada de treinos, no computador do piloto, para guardar o que
o `.ibt` original já tem, seria difícil de defender. 150 MB não é.

## O que se aceita perder

`Float32` custa precisão: o pico de velocidade volta do banco como 241,09 km/h
onde o bruto tinha 241,10. Aceitável porque nenhuma conclusão do coach muda com
um centésimo de km/h, e o `.ibt` original continua no disco para quem precisar do
número exato.

Guardar seis canais e não os 288 é a mesma aposta: o que ficou de fora não some,
fica no arquivo original. O dia em que a análise de setup entrar, a lista cresce
— e o custo de reprocessar uma sessão inteira é o que foi medido, 150 ms.
