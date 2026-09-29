/**
 * Constantes do layout binário do `.ibt` (e da memória compartilhada da fase 2).
 *
 * Fonte: `irsdk.h` do SDK oficial + engenharia reversa da comunidade
 * (crate `itelem`, `goiracing`, `pyirsdk`). Ver `docs/formato-ibt.md`.
 *
 * ⚠️ PENDENTE DE VALIDAÇÃO com um `.ibt` gerado por build recente do sim.
 * Enquanto isso não acontecer, trate estes offsets como hipótese testável,
 * não como verdade. Ver `docs/pendencias.md`.
 *
 * Todo o arquivo é little-endian.
 */

/** Header principal, idêntico ao da memória compartilhada. */
export const IBT_HEADER_SIZE = 112;

/** Header exclusivo do arquivo em disco. Não existe no stream ao vivo. */
export const DISK_SUB_HEADER_SIZE = 32;

/** Uma entrada da tabela de variáveis. */
export const VAR_HEADER_SIZE = 144;

/** Descritor de buffer de amostras dentro do header principal. */
export const VAR_BUF_SIZE = 16;

/**
 * O header reserva 4 descritores de buffer. O arquivo em disco usa só o primeiro;
 * ao vivo o sim alterna entre eles (double buffering). Ver `docs/formato-ibt.md`.
 */
export const VAR_BUF_COUNT = 4;

/**
 * A string YAML de session info é CP1252 / ISO-8859-1, **não** UTF-8.
 * Parsear como UTF-8 corrompe nome de piloto com acento.
 */
export const SESSION_INFO_ENCODING = 'windows-1252';

/** Offsets dos campos do header principal, em bytes a partir do início do arquivo. */
export const HEADER_OFFSETS = {
  /** Versão do formato. */
  version: 0,
  /** Bitfield de status da conexão (relevante ao vivo). */
  status: 4,
  /** Amostras por segundo. Tipicamente 60. */
  tickRate: 8,
  /** Contador de atualizações do YAML de session info. */
  sessionInfoUpdate: 12,
  /** Tamanho em bytes da string de session info. */
  sessionInfoLength: 16,
  /** Offset da string de session info. */
  sessionInfoOffset: 20,
  /** Quantidade de entradas na tabela de variáveis. */
  numVars: 24,
  /** Offset da tabela de variáveis. */
  varHeaderOffset: 28,
  /** Quantidade de buffers de amostra em uso. */
  numBuf: 32,
  /** Tamanho em bytes de uma amostra (um "frame" com todos os canais). */
  bufLen: 36,
  /** Início do array de `VAR_BUF_COUNT` descritores de buffer (após 2 ints de padding). */
  varBufs: 48,
} as const;

/**
 * Nome do arquivo mapeado que o sim publica enquanto roda (`IRSDK_MEMMAPFILENAME`
 * no `irsdk_defines.h`). É o canal oficial de leitura ao vivo (ADR 0022 e 0023).
 */
export const LIVE_MEMORY_MAP_NAME = 'Local\\IRSDKMemMapFileName';

/**
 * Bits do campo `status` do header (`irsdk_StatusField`). Só existe um: o sim
 * está conectado e escrevendo. Em arquivo o campo não tem uso.
 */
export const STATUS_CONNECTED = 1;

/**
 * Quantas vezes tentar copiar o frame mais recente antes de desistir do tick.
 *
 * Vem do `irsdk_getNewData` do SDK oficial (`irsdk_utils.cpp`), que tenta duas
 * vezes: se o sim reescreveu o buffer no meio da cópia, a segunda pega o
 * seguinte. Não foi escolhido aqui.
 */
export const LIVE_FRAME_COPY_ATTEMPTS = 2;

/** Offsets dentro de um descritor de buffer (`VAR_BUF_SIZE` bytes). */
export const VAR_BUF_OFFSETS = {
  tickCount: 0,
  bufOffset: 4,
} as const;

/** Offsets dentro do disk sub header, relativos ao fim do header principal. */
export const DISK_SUB_HEADER_OFFSETS = {
  /** `time_t` de 64 bits: data de início da sessão. */
  startDate: 0,
  /** Segundos (double) do início da telemetria. */
  startTime: 8,
  /** Segundos (double) do fim da telemetria. */
  endTime: 16,
  /** Voltas registradas na sessão. */
  lapCount: 24,
  /** Quantidade de amostras gravadas. `recordCount / tickRate` = duração em segundos. */
  recordCount: 28,
} as const;

/** Offsets dentro de uma entrada da tabela de variáveis (`VAR_HEADER_SIZE` bytes). */
export const VAR_HEADER_OFFSETS = {
  type: 0,
  /** Offset do valor **dentro da amostra**, não dentro do arquivo. */
  offset: 4,
  /** Quantidade de valores. > 1 em canais indexados por carro (`CarIdxLapDistPct`). */
  count: 8,
  countAsTime: 12,
  name: 16,
  description: 48,
  unit: 112,
} as const;

/** Tamanhos máximos dos campos de texto da tabela de variáveis. */
export const VAR_HEADER_TEXT_LENGTHS = {
  name: 32,
  description: 64,
  unit: 32,
} as const;

/** Códigos de tipo de variável, conforme `irsdk_VarType`. */
export const VarType = {
  Char: 0,
  Bool: 1,
  Int: 2,
  BitField: 3,
  Float: 4,
  Double: 5,
} as const;

export type VarTypeCode = (typeof VarType)[keyof typeof VarType];

/** Tamanho em bytes de cada tipo, indexado pelo código. */
export const VAR_TYPE_SIZES: Readonly<Record<VarTypeCode, number>> = {
  [VarType.Char]: 1,
  [VarType.Bool]: 1,
  [VarType.Int]: 4,
  [VarType.BitField]: 4,
  [VarType.Float]: 4,
  [VarType.Double]: 8,
};

export function isVarTypeCode(value: number): value is VarTypeCode {
  return value in VAR_TYPE_SIZES;
}
