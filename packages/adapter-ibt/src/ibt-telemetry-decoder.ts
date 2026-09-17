import type {
  DecodedMetadata,
  TelemetryDecoderPort,
  TelemetryFilePort,
  TelemetryFileRef,
} from '@telemetry/application';
import { type ChannelDescriptor, NotImplementedError } from '@telemetry/domain';
import {
  DISK_SUB_HEADER_SIZE,
  type DiskSubHeader,
  decodeDiskSubHeader,
  decodeHeader,
  decodeVarHeader,
  IBT_HEADER_SIZE,
  type IbtHeader,
  VAR_HEADER_SIZE,
} from '@telemetry/ibt-core';
import { toChannelDescriptor } from './channel-mapping.js';
import { toByteSource } from './ibt-byte-source.js';

/** O que se lê do arquivo sem depender do YAML de session info. */
export interface TechnicalMetadata {
  readonly header: IbtHeader;
  readonly diskSubHeader: DiskSubHeader;
  readonly channels: readonly ChannelDescriptor[];
}

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
  const channels: ChannelDescriptor[] = [];
  for (let index = 0; index < header.numVars; index += 1) {
    const start = index * VAR_HEADER_SIZE;
    channels.push(
      toChannelDescriptor(decodeVarHeader(table.subarray(start, start + VAR_HEADER_SIZE))),
    );
  }

  return { header, diskSubHeader, channels };
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

      // Pista, carro e piloto vêm da string YAML de session info, que é CP1252 e
      // ainda não é decodificada — ver docs/pendencias.md, item 6.
      void header;
      void diskSubHeader;
      void channels;
      throw new NotImplementedError(
        'Session info (YAML em CP1252) ainda não é decodificada; catálogo e header já são',
      );
    },

    readChannel(_ref: TelemetryFileRef, channel: string): AsyncIterable<number> {
      throw new NotImplementedError(`Leitura de amostras do canal "${channel}" não implementada`);
    },
  };
}
