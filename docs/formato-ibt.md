# O formato `.ibt`

Referência de trabalho para quem for mexer em `@telemetry/ibt-core`.

> A iRacing não publica a descrição do formato binário. O que está aqui vem do
> `irsdk.h` do SDK oficial e da engenharia reversa da comunidade (crate `itelem`,
> `goiracing`, `pyirsdk`). **Nada disso foi validado contra um `.ibt` real neste
> projeto ainda** — ver `docs/pendencias.md`, pendência #1.

Tudo é little-endian.

## Como o arquivo nasce

- No sim, `Alt-L` arma a telemetria. Não precisa estar no carro.
- **Cada entrada no carro gera um arquivo novo** em `Documentos\iRacing\telemetry\`.
- Dá para ligar gravação permanente em `Options > Misc`.
- É o mesmo formato que o MoTeC i2 (via conversor) e o McLaren ATLAS (plugin oficial)
  consomem.

Enquanto a sessão roda, o arquivo está sendo escrito e fica **travado pelo Windows**.
Ler cedo demais dá `EBUSY` ou arquivo truncado — por isso o watcher espera estabilizar
(ver `packages/adapter-fs/src/telemetry-watcher.fs.ts`).

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
> `sessionInfoLength`. O `irsdk.h` traz a ordem acima. Como os dois são int32
> adjacentes, trocar os dois dá offsets absurdos na hora de ler o YAML — é o
> primeiro sintoma a checar se a session info vier lixo.

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
- **Amostra não sabe de volta.** O agrupamento por volta é trabalho da
  `@telemetry/domain`, usando `Lap`/`LapDistPct`.

## Memória compartilhada (fase 2, não implementar agora)

- Região `Local\IRSDKMemMapFileName`, atualizada a ~60 Hz.
- Mesma estrutura, **sem** o disk sub header.
- Até 4 buffers em double buffering: o sim alterna a escrita para que o leitor sempre
  pegue um frame consistente.
- Ao ler vários canais do mesmo tick, congele o buffer no início do loop antes de
  qualquer leitura (`freeze_var_buffer_latest()` no `pyirsdk`). Sem isso você mistura
  dados de ticks diferentes — e o bug aparece como ruído, não como erro.

## Fontes

Ver `docs/referencias.md`.
