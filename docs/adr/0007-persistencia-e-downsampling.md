# ADR 0007 — Persistência e downsampling

**Status:** Proposto · 2026-09-17

## Contexto

Uma stint de 30 minutos a 60 Hz passa de 100 mil amostras por canal, com dezenas de
canais. Um gráfico de 1200 px mostra, na prática, ~1200 pontos. Reparsear o mesmo
arquivo a cada visualização é desperdício conhecido — o `iracing-telemetry-analyzer`
persiste o resultado do parse em disco exatamente por isso.

Duas estratégias:

1. **Guardar cru, agregar na leitura.** Nada de informação se perde; cada consulta
   paga o custo.
2. **Reduzir na ingestão.** Leitura barata; o que foi descartado não volta.

## Decisão proposta

Caminho híbrido:

- o `.ibt` original permanece no disco do piloto e é a fonte da verdade;
- a ingestão persiste um **derivado por volta** (séries normalizadas por `lapDistPct`,
  em resolução alta o suficiente para análise: na ordem de 1000 pontos por volta);
- a UI recebe séries reduzidas sob demanda a partir desse derivado;
- reprocessar do original é sempre possível, porque ele não é descartado.

Só vira `Aceito` depois de medir o tamanho do derivado com um arquivo real.

## Downsampling

Redução por média simples achata picos de frenagem — justamente o que o piloto quer
ver. O alvo é um algoritmo que preserve extremos: LTTB ou min/max por bucket.

O delta **nunca** é calculado sobre série reduzida. Reduz-se para desenhar, não para
contar.

## Em aberto

Formato de persistência do derivado (SQLite? Parquet? JSON comprimido?) e política de
retenção. Ver `docs/pendencias.md`.
