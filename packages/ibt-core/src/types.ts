import type { VarTypeCode } from './format.js';

/** Descritor de um buffer de amostras. Em disco só o primeiro é usado. */
export interface VarBufDescriptor {
  tickCount: number;
  bufOffset: number;
}

/** Header principal: o mesmo em disco e na memória compartilhada. */
export interface IbtHeader {
  version: number;
  status: number;
  /** Amostras por segundo. Normalmente 60. */
  tickRate: number;
  sessionInfoUpdate: number;
  sessionInfoLength: number;
  sessionInfoOffset: number;
  numVars: number;
  varHeaderOffset: number;
  numBuf: number;
  /** Tamanho de uma amostra em bytes. */
  bufLen: number;
  varBufs: readonly VarBufDescriptor[];
}

/** Header exclusivo do arquivo em disco. Ausente ao vivo. */
export interface DiskSubHeader {
  /** Epoch em segundos (`time_t` de 64 bits no arquivo). */
  startDate: bigint;
  startTime: number;
  endTime: number;
  lapCount: number;
  recordCount: number;
}

/** Uma entrada da tabela de variáveis: descreve um canal de telemetria. */
export interface VarHeader {
  type: VarTypeCode;
  /** Offset do valor dentro de uma amostra. */
  offset: number;
  /** Quantidade de valores do canal. > 1 em canais indexados por carro. */
  count: number;
  countAsTime: boolean;
  /** Identificador do canal, ex.: `Speed`, `LapDistPct`, `CarIdxLapDistPct`. */
  name: string;
  description: string;
  /** Unidade declarada pelo sim, ex.: `m/s`, `%`, `rad/s`. */
  unit: string;
}

/**
 * Catálogo de canais montado em runtime a partir da tabela de variáveis.
 *
 * Regra do projeto: **nunca** manter uma lista fixa de canais no código.
 * O conjunto muda entre carros e entre builds do sim.
 */
export interface VarCatalog {
  readonly vars: readonly VarHeader[];
  get(name: string): VarHeader | undefined;
  has(name: string): boolean;
}

/** Tudo que descreve o arquivo antes das amostras. */
export interface IbtMetadata {
  header: IbtHeader;
  /** Presente só quando a fonte é um arquivo em disco. */
  diskSubHeader?: DiskSubHeader;
  catalog: VarCatalog;
  /** YAML de session info ainda como texto, já decodificado de CP1252. */
  sessionInfoYaml: string;
}

/** Valor de um canal numa amostra. Escalar quando `count === 1`, array quando maior. */
export type ChannelValue = number | boolean | string | readonly number[] | readonly boolean[];

/** Uma amostra: um instante com todos os canais. */
export interface TelemetrySample {
  /** Índice da amostra no arquivo, de 0 a `recordCount - 1`. */
  index: number;
  /** Segundos desde o início da gravação: `index / tickRate`. */
  time: number;
  get(channel: string): ChannelValue | undefined;
  toJSON(): Record<string, ChannelValue>;
}
