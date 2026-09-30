# O formato `.ibt`

Referência de trabalho para quem for mexer no decoder (`apps/desktop/src/main/ibt/`).

> A iRacing não publica a descrição do formato binário. O que está aqui vem do
> `irsdk.h` do SDK oficial e da engenharia reversa da comunidade (crate `itelem`,
> `goiracing`, `pyirsdk`).
>
> **Validado em 2026-09-19** contra oito arquivos reais, em dois carros e duas
> pistas: Ferrari 296 GT3 em Road Atlanta (288 canais, `bufLen` 1108) e
> Mercedes-AMG GT3 em Suzuka (287 canais, `bufLen` 1101). A aritmética de offsets
> fecha no byte nos oito, e os valores lidos batem com o que o sim mostrou. Que
> `bufLen` e a contagem de canais mudem entre carros e a leitura continue certa é
> o que descarta "acertou por acaso num arquivo". Ver `docs/pendencias.md`.

Tudo é little-endian.

## Como o arquivo nasce

- No sim, `Alt-L` arma a telemetria. Não precisa estar no carro.
- **Cada entrada no carro gera um arquivo novo** em `Documentos\iRacing\telemetry\`.
- Dá para ligar gravação permanente em `Options > Misc`.
- É o mesmo formato que o MoTeC i2 (via conversor) e o McLaren ATLAS (plugin oficial)
  consomem.

Enquanto a sessão roda, o arquivo está sendo escrito e fica **travado pelo Windows**.
Ler cedo demais dá `EBUSY` ou arquivo truncado — por isso o watcher espera estabilizar
(ver `apps/desktop/src/main/ingestion/watcher.ts`).

## Layout

| # | Bloco | Tamanho | Existe ao vivo? |
|---|---|---|---|
| 1 | Header principal | 112 bytes | sim |
| 2 | Disk sub header | 32 bytes | **não** |
| 3 | Session info (YAML) | `sessionInfoLength` | sim |
| 4 | Tabela de variáveis | `numVars` × 144 bytes | sim |
| 5 | Amostras | `recordCount` × `bufLen` | sim |

### 1. Header principal (112 bytes)

| Offset | Campo | Tipo | Nota |
|---|---|---|---|
| 0 | `version` | int32 | |
| 4 | `status` | int32 | bitfield, relevante ao vivo |
| 8 | `tickRate` | int32 | amostras/s, tipicamente 60 |
| 12 | `sessionInfoUpdate` | int32 | contador de atualização do YAML |
| 16 | `sessionInfoLength` | int32 | |
| 20 | `sessionInfoOffset` | int32 | |
| 24 | `numVars` | int32 | |
| 28 | `varHeaderOffset` | int32 | |
| 32 | `numBuf` | int32 | em disco é 1 |
| 36 | `bufLen` | int32 | tamanho de **uma** amostra |
| 40 | padding | 8 bytes | |
| 48 | `varBuf[4]` | 4 × 16 bytes | `{ tickCount: int32, bufOffset: int32, pad: 8 }` |

> ⚠️ O documento de referência inicial lista `sessionInfoOffset` antes de
> `sessionInfoLength`. O `irsdk.h` traz a ordem acima, e o arquivo real **confirmou
> o `irsdk.h`**: com a ordem trocada, a session info vem lixo. Como os dois são
> int32 adjacentes, é o primeiro sintoma a checar se o YAML não parsear.

### 2. Disk sub header (32 bytes)

Só existe em arquivo. É o que diz quantas amostras o arquivo tem.

| Offset | Campo | Tipo |
|---|---|---|
| 0 | `startDate` | int64 (`time_t`) |
| 8 | `startTime` | double |
| 16 | `endTime` | double |
| 24 | `lapCount` | int32 |
| 28 | `recordCount` | int32 |

`recordCount / tickRate` = duração em segundos. 3371 amostras a 60 Hz ≈ 56 s.

### 3. Session info (YAML)

Dados semi-estáticos: `WeekendInfo` (pista, layout, condições), `SessionInfo`
(sessões e resultados), `DriverInfo` (carros e pilotos).

Duas armadilhas:

1. **Encoding é CP1252 / ISO-8859-1, não UTF-8.** Decodificar como UTF-8 corrompe
   nome de piloto com acento — e como boa parte dos nomes é ASCII, o bug passa
   despercebido até aparecer um "André". Use `TextDecoder('windows-1252')`.
2. O YAML da iRacing tem valores não citados que parsers estritos recusam
   (`TeamName: 3:16 Racing`, por exemplo). Isso influencia a escolha da lib de YAML.

### 4. Tabela de variáveis (144 bytes por entrada)

| Offset | Campo | Tipo |
|---|---|---|
| 0 | `type` | int32 |
| 4 | `offset` | int32 (dentro da **amostra**) |
| 8 | `count` | int32 |
| 12 | `countAsTime` | bool + 3 bytes de padding |
| 16 | `name` | char[32] |
| 48 | `description` | char[64] |
| 112 | `unit` | char[32] |

Campos de texto são terminados em NUL e podem ocupar o campo inteiro sem terminador.

Tipos (`irsdk_VarType`):

| Código | Tipo | Bytes |
|---|---|---|
| 0 | char | 1 |
| 1 | bool | 1 |
| 2 | int | 4 |
| 3 | bitField | 4 |
| 4 | float | 4 |
| 5 | double | 8 |

`count > 1` aparece em canais indexados por carro (`CarIdxLapDistPct` e afins): são
`count` valores consecutivos a partir de `offset`.

### 5. Amostras

Cada amostra é um frame com todos os canais. Para ler o canal X na amostra N:

```
bufOffset + (N * bufLen) + varHeader.offset
```

`bufOffset` vem de `varBuf[0]` no arquivo em disco.

## Consequências práticas

- **Catálogo em runtime, sempre.** O conjunto de canais muda entre carros e builds.
  Lista fixa no código quebra em silêncio.
- **Streaming, não `readFile`.** Uma stint de 30 min a 60 Hz passa de 100 mil
  amostras por canal.
- **Amostra não sabe de volta.** O agrupamento por volta é trabalho do
  domínio (`detectLaps`), usando `Lap`/`LapDistPct`.

## Memória compartilhada (fase 2, ADR 0023)

Implementada em `ibt/live.ts` (puro) e `ibt/live-memory.ts` (Windows, via `koffi`).
**Conferida contra o sim aberto em 2026-09-26** (Mercedes-AMG GT3 / Road Atlanta,
treino). O teste é `ibt/live-real-sim.test.ts`, que pula com o sim
fechado.

Medido:

| Campo | Valor | Nota |
|---|---|---|
| `numVars` | 335 | 287 no `.ibt` da Mercedes: ao vivo vêm os `CarIdx*` |
| `bufLen` | 8616 B | ~8× o do `.ibt` (1101 B) |
| canais com `count > 1` | 45 | quase todos de 64 posições (`CarIdx*`), alguns de 6; somam 6768 B |
| `numBuf` | 3 | ticks consecutivos: ~50 ms de folga para quem lê atrasado |
| session info | 512 KB reservados | o texto termina no primeiro NUL |

⚠️ **Ao vivo, `Σ tamanho × count ≠ bufLen`.** A memória tem padding entre canais
(27 buracos, quase todos de 32 bytes depois de um array `CarIdx*`); o arquivo não.
A conta que vale ao vivo é: nenhum canal invade o anterior, e o último termina no
`bufLen`. Ler pelo `offset` de cada canal, como o decoder faz, não é afetado.

- Região `Local\IRSDKMemMapFileName`, atualizada a ~60 Hz. Aberta com
  `FILE_MAP_READ` e nada mais.
- Mesma estrutura, **sem** o disk sub header.
- Até 4 buffers em double buffering: o sim alterna a escrita para que o leitor sempre
  pegue um frame consistente.
- Ao ler vários canais do mesmo tick, congele o buffer no início do loop antes de
  qualquer leitura (`freeze_var_buffer_latest()` no `pyirsdk`). Sem isso você mistura
  dados de ticks diferentes — e o bug aparece como ruído, não como erro.
  O código segue o `irsdk_getNewData`: anota o `tickCount`, copia, relê, e
  descarta a cópia se mudou (`freezeLatestFrame`).
- O bit 1 do `status` diz se o sim está numa sessão escrevendo. Sem ele, o app
  solta o handle e reabre no próximo pedido, como o SDK oficial.
- Ao vivo, `sessionInfoLength` é o espaço reservado, não o tamanho do texto: a
  string termina no primeiro NUL, e o que vem depois é sobra de uma versão
  anterior.

## Fontes

Ver `docs/referencias.md`.

### A primeira amostra pode ser fantasma

O primeiro registro do arquivo às vezes sai com `Lap` e `LapDistPct` zerados
enquanto o resto já está preenchido — o sim grava o tick antes de popular o
buffer. Visto num arquivo real: amostra 0 com `Lap = 0`, amostra 1 com `Lap = 6`,
e o relógio da sessão contínuo entre as duas.

Quem recorta voltas **descarta a amostra 0**, senão nasce uma volta 0 de duração
zero e a detecção de linha de chegada vê um salto que não existiu.

### Os deltas que o sim publica (`LapDeltaTo*`)

Medido em 2026-09-29 contra os `.ibt` reais da pasta do iRacing, comparando o
canal do sim com a conta por distância do domínio (`firstArrivals` +
`arrivalAt`, a mesma do delta da análise):

- **É por distância, acumulado na volta.** Em cada tick, o tempo desta volta até
  a posição atual (`LapDistPct`) menos o tempo da referência até a mesma
  posição. Com a mesma volta de referência, o canal do sim e a conta do domínio
  batem em ±0,01 s ao longo da volta inteira (Imola, Porsche 992 Cup, 5 voltas;
  Suzuka, Mercedes GT3, mediana 0,008 s). Não zera por setor: zera só na linha
  de chegada, quando a volta recomeça.
- **Parado, ele cresce um segundo por segundo.** 15,7 s parado na pista em
  Suzuka levaram o delta de +5,30 para +20,99, com `_OK = 1` o tempo todo. Não
  reseta.
- **`_OK` vai a 0** no box, na volta de saída e antes da primeira volta
  cronometrada. O overlay esconde o valor nesses trechos.
- **`LapDeltaToBestLap` e `LapDeltaToOptimalLap` não são da sessão.** A
  referência é a melhor volta (e a ideal) **de todos os tempos** com aquele carro
  naquela pista, que o sim guarda em `Documentos\iRacing\lapfiles\<pista>\<custid>_<carro>.blap`
  (e `.olap`). Numa sessão de 26/09 em Road Atlanta, a referência era uma volta de
  ~79,4 s do `.blap` de 21/09, que não estava em arquivo nenhum da sessão. Quem
  quer "contra a minha melhor de hoje" usa `LapDeltaToSessionBestLap`.
- **`LapBestLapTime` atualiza com atraso** em relação à troca da referência do
  `LapDeltaToSessionBestLap`: não use um para adivinhar a volta do outro.
