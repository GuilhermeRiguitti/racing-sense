import type { ChannelDescriptor } from '../domain/channel.js';
import { NotFoundError } from '../domain/errors.js';
import type { TelemetrySession } from '../domain/session.js';
import type { ByteSource } from './byte-source.js';
import { toChannelDescriptor } from './channel-mapping.js';
import {
  decodeDiskSubHeader,
  decodeHeader,
  decodeVarHeader,
  readChannelValue,
  sampleValueOffset,
} from './decoder.js';
import { DISK_SUB_HEADER_SIZE, IBT_HEADER_SIZE, VAR_HEADER_SIZE } from './format.js';
import { decodeSessionInfo, type SessionInfoNode } from './session-info.js';
import {
  toCarLimits,
  toCarRef,
  toCarSetup,
  toConditions,
  toSectorStarts,
  toDriverName,
  toRecordedAt,
  toSessionType,
  toTrackRef,
} from './session-mapping.js';
import type { DiskSubHeader, IbtHeader, VarHeader } from './types.js';

/** O que se sabe do arquivo antes de tocar nas amostras. */
export interface DecodedMetadata {
  readonly tickRate: number;
  readonly sampleCount: number;
  readonly channels: readonly ChannelDescriptor[];
  /** Pista, carro, piloto — o que vier da session info. */
  readonly session: Omit<TelemetrySession, 'id' | 'tickRate' | 'sampleCount' | 'channels'>;
}

/** O que se lê do arquivo sem depender do YAML de session info. */
export interface TechnicalMetadata {
  readonly header: IbtHeader;
  readonly diskSubHeader: DiskSubHeader;
  readonly channels: readonly ChannelDescriptor[];
  /** A tabela crua, que a leitura de amostras precisa (tipo e offset por canal). */
  readonly variables: readonly VarHeader[];
}

/** Quantas amostras ler por vez do disco. ~300 KB por bloco num arquivo típico. */
const SAMPLES_PER_CHUNK = 256;

/**
 * Lê header, disk sub header e catálogo de canais.
 *
 * O catálogo é montado percorrendo a tabela de variáveis do arquivo — nunca uma
 * lista fixa no código.
 */
export async function readTechnicalMetadata(source: ByteSource): Promise<TechnicalMetadata> {
  const header = decodeHeader(await source.read(0, IBT_HEADER_SIZE));
  const diskSubHeader = decodeDiskSubHeader(
    await source.read(IBT_HEADER_SIZE, DISK_SUB_HEADER_SIZE),
  );

  const table = await source.read(header.varHeaderOffset, header.numVars * VAR_HEADER_SIZE);
  const variables: VarHeader[] = [];
  for (let index = 0; index < header.numVars; index += 1) {
    const start = index * VAR_HEADER_SIZE;
    variables.push(decodeVarHeader(table.subarray(start, start + VAR_HEADER_SIZE)));
  }

  return {
    header,
    diskSubHeader,
    channels: variables.map(toChannelDescriptor),
    variables,
  };
}

/** Lê e parseia o YAML de session info do arquivo. */
export async function readSessionInfo(
  source: ByteSource,
  header: IbtHeader,
): Promise<SessionInfoNode> {
  return decodeSessionInfo(await source.read(header.sessionInfoOffset, header.sessionInfoLength));
}

/** Metadados no vocabulário do domínio: pista, carro, condições e catálogo. */
export async function readMetadata(source: ByteSource): Promise<DecodedMetadata> {
  const { header, diskSubHeader, channels } = await readTechnicalMetadata(source);
  const info = await readSessionInfo(source, header);

  return {
    tickRate: header.tickRate,
    sampleCount: diskSubHeader.recordCount,
    channels,
    session: {
      track: toTrackRef(info),
      car: toCarRef(info),
      driverName: toDriverName(info),
      sessionType: toSessionType(info),
      recordedAt: toRecordedAt(diskSubHeader.startDate),
      conditions: toConditions(info),
      setup: toCarSetup(info),
      carLimits: toCarLimits(info),
      sectorStartPcts: toSectorStarts(info),
    },
  };
}

/**
 * Valores de um canal, na ordem gravada, em streaming.
 *
 * Um canal por chamada: uma stint de 30 min a 60 Hz passa de 100 mil amostras
 * por canal, e carregar tudo de uma vez é o caminho curto para estourar memória.
 *
 * Lê em blocos de amostras em vez de um `read` por valor: uma chamada de I/O por
 * amostra seria o gargalo inteiro.
 */
export async function* readChannel(source: ByteSource, channel: string): AsyncIterable<number> {
  const { header, diskSubHeader, variables } = await readTechnicalMetadata(source);
  const variable = variables.find((candidate) => candidate.name === channel);
  if (variable === undefined) {
    throw new NotFoundError(`Canal "${channel}" não existe neste arquivo`);
  }

  const bufOffset = header.varBufs[0]?.bufOffset ?? 0;

  for (let first = 0; first < diskSubHeader.recordCount; first += SAMPLES_PER_CHUNK) {
    const count = Math.min(SAMPLES_PER_CHUNK, diskSubHeader.recordCount - first);
    const chunk = await source.read(
      sampleValueOffset(bufOffset, header.bufLen, first, 0),
      count * header.bufLen,
    );
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);

    for (let index = 0; index < count; index += 1) {
      // Canal com `count > 1` é indexado por carro (ex.: `CarIdxLapDistPct`).
      // Aqui vale o primeiro valor; ler os outros é outro recorte, e o formato
      // já dá o passo: `VAR_TYPE_SIZES[variable.type]`.
      yield readChannelValue(view, index * header.bufLen + variable.offset, variable.type);
    }
  }
}
