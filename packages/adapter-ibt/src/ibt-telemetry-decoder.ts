import type {
  DecodedMetadata,
  TelemetryDecoderPort,
  TelemetryFilePort,
  TelemetryFileRef,
} from '@telemetry/application-desktop';
import { type ChannelDescriptor, NotFoundError } from '@telemetry/domain';
import {
  DISK_SUB_HEADER_SIZE,
  type DiskSubHeader,
  decodeDiskSubHeader,
  decodeHeader,
  decodeSessionInfo,
  decodeVarHeader,
  IBT_HEADER_SIZE,
  type IbtHeader,
  readChannelValue,
  type SessionInfoNode,
  sampleValueOffset,
  VAR_HEADER_SIZE,
  type VarHeader,
} from '@telemetry/ibt-core';
import { toChannelDescriptor } from './channel-mapping.js';
import { toByteSource } from './ibt-byte-source.js';
import {
  toCarRef,
  toConditions,
  toDriverName,
  toRecordedAt,
  toSessionType,
  toTrackRef,
} from './session-mapping.js';

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
export async function readTechnicalMetadata(
  files: TelemetryFilePort,
  ref: TelemetryFileRef,
): Promise<TechnicalMetadata> {
  const source = toByteSource(files, ref);

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
  files: TelemetryFilePort,
  ref: TelemetryFileRef,
  header: IbtHeader,
): Promise<SessionInfoNode> {
  const source = toByteSource(files, ref);
  return decodeSessionInfo(await source.read(header.sessionInfoOffset, header.sessionInfoLength));
}

/**
 * Adapter do decoder `.ibt`.
 *
 * Trocar este adapter (por uma lib da comunidade, ou por um decoder de outro
 * simulador) não muda um caso de uso sequer: a aplicação só conhece
 * `TelemetryDecoderPort`.
 */
export function createIbtTelemetryDecoder(files: TelemetryFilePort): TelemetryDecoderPort {
  return {
    async readMetadata(ref: TelemetryFileRef): Promise<DecodedMetadata> {
      const { header, diskSubHeader, channels } = await readTechnicalMetadata(files, ref);
      const info = await readSessionInfo(files, ref, header);

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
        },
      };
    },

    /**
     * Valores de um canal, em streaming.
     *
     * Lê em blocos de amostras em vez de um `read` por valor: a 60 Hz, uma stint
     * de meia hora tem mais de 100 mil amostras, e uma chamada de I/O por amostra
     * seria o gargalo inteiro.
     */
    async *readChannel(ref: TelemetryFileRef, channel: string): AsyncIterable<number> {
      const { header, diskSubHeader, variables } = await readTechnicalMetadata(files, ref);
      const variable = variables.find((candidate) => candidate.name === channel);
      if (variable === undefined) {
        throw new NotFoundError(`Canal "${channel}" não existe neste arquivo`);
      }

      const bufOffset = header.varBufs[0]?.bufOffset ?? 0;
      const source = toByteSource(files, ref);

      for (let first = 0; first < diskSubHeader.recordCount; first += SAMPLES_PER_CHUNK) {
        const count = Math.min(SAMPLES_PER_CHUNK, diskSubHeader.recordCount - first);
        const chunk = await source.read(
          sampleValueOffset(bufOffset, header.bufLen, first, 0),
          count * header.bufLen,
        );
        const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);

        for (let index = 0; index < count; index += 1) {
          // Canal com `count > 1` é indexado por carro (ex.: `CarIdxLapDistPct`).
          // Aqui vale o primeiro valor; ler os outros é recorte de outro caso de
          // uso, e o formato já dá o passo: `VAR_TYPE_SIZES[variable.type]`.
          yield readChannelValue(view, index * header.bufLen + variable.offset, variable.type);
        }
      }
    },
  };
}
