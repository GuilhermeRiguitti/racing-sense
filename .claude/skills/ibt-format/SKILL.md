---
name: ibt-format
description: Referência do formato binário .ibt do iRacing para trabalho de decodificação. Use ao implementar, corrigir ou revisar qualquer coisa que leia bytes de telemetria — header, disk sub header, tabela de variáveis, session info (CP1252) ou amostras — e quando um valor decodificado vier absurdo, vazio ou corrompido. Cobre offsets, tipos, armadilhas de encoding e o roteiro de diagnóstico.
---

# Formato `.ibt`

Tudo little-endian. As constantes vivem em `apps/desktop/src/main/ibt/format.ts` — **use-as, não redigite números**.

## Ordem dos blocos

| # | Bloco | Tamanho | Ao vivo? |
|---|---|---|---|
| 1 | Header principal | 112 B | sim |
| 2 | Disk sub header | 32 B | não |
| 3 | Session info (YAML, CP1252) | `sessionInfoLength` | sim |
| 4 | Tabela de variáveis | `numVars` × 144 B | sim |
| 5 | Amostras | `recordCount` × `bufLen` | sim |

## Header principal (offsets em bytes)

`version` 0 · `status` 4 · `tickRate` 8 · `sessionInfoUpdate` 12 · `sessionInfoLength` 16 ·
`sessionInfoOffset` 20 · `numVars` 24 · `varHeaderOffset` 28 · `numBuf` 32 · `bufLen` 36 ·
padding 40–47 · `varBuf[4]` a partir de 48 (16 B cada: `tickCount` 0, `bufOffset` 4).

## Disk sub header (relativo ao fim do header principal)

`startDate` 0 (int64) · `startTime` 8 (double) · `endTime` 16 (double) · `lapCount` 24 ·
`recordCount` 28.

Duração em segundos = `recordCount / tickRate`.

## Tabela de variáveis (144 B por entrada)

`type` 0 · `offset` 4 · `count` 8 · `countAsTime` 12 (+3 B padding) · `name` 16 (char[32]) ·
`description` 48 (char[64]) · `unit` 112 (char[32]).

Tipos: 0 char (1 B) · 1 bool (1 B) · 2 int (4 B) · 3 bitField (4 B) · 4 float (4 B) · 5 double (8 B).

## Ler um valor

```
bufOffset + (índiceDaAmostra * bufLen) + varHeader.offset
```

`bufOffset` vem de `varBufs[0]` no arquivo em disco.

## Regras que não se quebram

1. **Catálogo em runtime.** Nunca lista fixa de canais: o conjunto muda entre carros e
   builds do sim. Percorra a tabela de variáveis.
2. **Session info é CP1252**, não UTF-8. `TextDecoder('windows-1252')`.
   Como a maioria dos nomes é ASCII, o bug só aparece com acento — parece funcionar até
   não funcionar.
3. **Leitura curta falha alto.** Nunca devolva buffer parcial: vira amostra corrompida
   longe da causa.
4. **O decoder não faz I/O.** Bytes entram por `ByteSource`; quem abre o arquivo é
   `openIbtFile` (`ibt/ibt-file.ts`). `channel-mapping.ts` e `session-mapping.ts`
   traduzem `VarHeader` e session info para o vocabulário do domínio, para o
   formato não vazar para a ingestão e a análise.

## Duas contas que provam que os offsets estão certos

Faça as duas antes de acreditar em qualquer valor decodificado. Elas fecham no byte —
um único byte de deslocamento derruba as duas:

```
bufOffset + recordCount * bufLen  ==  tamanho do arquivo
Σ (VAR_TYPE_SIZES[canal.type] * canal.count)  ==  bufLen
```

Depois, uma terceira de sanidade semântica: **`LapDistPct` tem que ficar em [0, 1]**.
É o detector mais barato de offset torto que existe neste formato.

Ordem de grandeza em arquivos reais de GT3 (build 2026.06), `tickRate` 60:

| Carro / pista | Canais | `bufLen` |
|---|---|---|
| Ferrari 296 GT3 / Road Atlanta | 288 | 1108 B |
| Mercedes-AMG GT3 / Suzuka | 287 | 1101 B |

**Os dois mudam entre carros.** Nunca assuma `bufLen` nem contagem de canais: os
dois saem do header do arquivo em mãos.

**A amostra 0 pode ser fantasma.** Vista num arquivo real: `Lap` e `LapDistPct`
zerados na amostra 0 e o valor real já na amostra 1, com o relógio da sessão
contínuo entre as duas — o sim gravou o tick antes de popular o buffer. Quem
recorta volta descarta a amostra 0; quem decodifica devolve ela como está.

## Diagnóstico quando o valor vem errado

| Sintoma | Causa provável |
|---|---|
| `numVars` absurdo, `bufLen` incoerente | offset do header errado, ou arquivo não é `.ibt` |
| Session info vem binário/ilegível | `sessionInfoOffset` e `sessionInfoLength` trocados (são int32 adjacentes) |
| Nome de piloto com caractere estranho | decodificado como UTF-8 em vez de CP1252 |
| Canal certo, valor sem sentido | tipo lido errado (float × int) ou `offset` do canal aplicado no arquivo em vez de na amostra |
| Últimas amostras com lixo | arquivo truncado: sessão ainda estava gravando. Ver o watcher em `apps/desktop/src/main/ingestion/watcher.ts` |
| Canais misturados no tempo (fase 2) | buffer não congelado antes da leitura do tick |

Detalhes e fontes: `docs/formato-ibt.md`. Os offsets acima foram conferidos contra
arquivos reais em 2026-09-19; o teste que sustenta isso é
`apps/desktop/src/main/ibt/ibt-real-file.test.ts`, que **pula** quando não há fixture em
`apps/desktop/fixtures/real/` — sem arquivo lá, o verde prova só consistência interna.
