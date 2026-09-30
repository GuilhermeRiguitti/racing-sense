/**
 * O significado dos valores que alguns canais ao vivo carregam.
 *
 * Canal inteiro ou bitfield do iRacing é código: `CarIdxTrackSurface = 1` é "na
 * vaga do box", `SessionFlags & 0x8` é bandeira amarela. Os códigos vêm do
 * `irsdk_defines.h` do SDK oficial (`irsdk_TrkLoc`, `irsdk_Flags`,
 * `irsdk_CarLeftRight`, `irsdk_SessionState`) — nenhum foi escolhido aqui.
 *
 * Não é catálogo de canais (regra 13): o canal continua vindo da tabela de
 * variáveis em runtime. Isto só traduz o valor quando o canal existe.
 */

/** `irsdk_TrkLoc`: onde o carro está. `-1` é "fora do mundo" (garagem, sem carro). */
export const TRACK_SURFACE = {
  notInWorld: -1,
  offTrack: 0,
  inPitStall: 1,
  approachingPits: 2,
  onTrack: 3,
} as const;

/** `irsdk_Flags`: bits de `SessionFlags` (e de `CarIdxSessionFlags`). */
export const SESSION_FLAG = {
  checkered: 0x00000001,
  white: 0x00000002,
  green: 0x00000004,
  yellow: 0x00000008,
  red: 0x00000010,
  blue: 0x00000020,
  debris: 0x00000040,
  crossed: 0x00000080,
  yellowWaving: 0x00000100,
  oneLapToGreen: 0x00000200,
  greenHeld: 0x00000400,
  tenToGo: 0x00000800,
  fiveToGo: 0x00001000,
  randomWaving: 0x00002000,
  caution: 0x00004000,
  cautionWaving: 0x00008000,
  black: 0x00010000,
  disqualify: 0x00020000,
  servicible: 0x00040000,
  furled: 0x00080000,
  repair: 0x00100000,
  startHidden: 0x10000000,
  startReady: 0x20000000,
  startSet: 0x40000000,
  startGo: 0x80000000,
} as const;

/** `irsdk_CarLeftRight`: o "spotter" do sim — tem carro ao lado, e de que lado. */
export const CAR_LEFT_RIGHT = {
  off: 0,
  clear: 1,
  carLeft: 2,
  carRight: 3,
  carLeftRight: 4,
  twoCarsLeft: 5,
  twoCarsRight: 6,
} as const;

/** `irsdk_SessionState`. */
export const SESSION_STATE = {
  invalid: 0,
  getInCar: 1,
  warmup: 2,
  paradeLaps: 3,
  racing: 4,
  checkered: 5,
  coolDown: 6,
} as const;

/**
 * Valor que o sim escreve em `SessionLapsRemainEx` e `SessionLapsRemain` quando a
 * sessão não tem limite de voltas (32767, o maior `short`).
 */
export const UNLIMITED_LAPS = 32767;

/**
 * Valor que o sim escreve em `SessionTimeRemain` quando a sessão não tem limite
 * de tempo (604800 s, uma semana).
 */
export const UNLIMITED_TIME_SECONDS = 604800;
