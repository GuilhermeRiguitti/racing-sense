import type { CarLimits, SetupNode } from '../domain/car-setup.js';
import { type SessionConditions, UNKNOWN_CONDITIONS } from '../domain/conditions.js';
import { isValidSectorStarts, type SectorStarts } from '../domain/sectors.js';
import type { CarRef, TrackRef } from '../domain/session.js';
import {
  readNumber,
  readPath,
  type SessionInfoNode,
  type SessionInfoValue,
} from './session-info.js';

/**
 * Traduz a session info da iRacing para o vocabulário do domínio.
 *
 * Camada anticorrupção: `WeekendInfo`, `DriverInfo` e a grafia de cada campo
 * ficam deste lado. O domínio vê `TrackRef`, `CarRef` e `SessionConditions`.
 *
 * Campo ausente vira `null`, nunca zero: num `.ibt` de outra build do sim, ou de
 * outro carro, alguns campos simplesmente não existem — e `0 °C` é um dado,
 * enquanto `null` é "não sei".
 */
const asArray = (value: SessionInfoValue | undefined): SessionInfoValue[] =>
  Array.isArray(value) ? value : [];

/** O piloto dono do arquivo, entre todos os carros da sessão. */
export function findPlayerDriver(doc: SessionInfoNode): SessionInfoValue | undefined {
  const driverInfo = doc.DriverInfo;
  const playerIdx = readPath(driverInfo, 'DriverCarIdx');
  const drivers = asArray(
    typeof driverInfo === 'object' && !Array.isArray(driverInfo) ? driverInfo?.Drivers : undefined,
  );

  return drivers.find((driver) => readPath(driver, 'CarIdx') === playerIdx);
}

export function toTrackRef(doc: SessionInfoNode): TrackRef {
  const weekend = doc.WeekendInfo;
  // `TrackName` já vem com o layout dentro ("roadatlanta full"): é o id estável.
  const id = readPath(weekend, 'TrackName') ?? 'desconhecida';

  // Vem como "4.0569 km"; `readNumber` tira a unidade.
  const km = readNumber(readPath(weekend, 'TrackLength'));

  return {
    id,
    name: readPath(weekend, 'TrackDisplayName') ?? id,
    config: readPath(weekend, 'TrackConfigName') ?? null,
    lengthMeters: km === null ? null : Math.round(km * 1000),
  };
}

export function toCarRef(doc: SessionInfoNode): CarRef {
  const driver = findPlayerDriver(doc);
  const id = readPath(driver, 'CarPath') ?? 'desconhecido';

  return { id, name: readPath(driver, 'CarScreenName') ?? id };
}

export function toDriverName(doc: SessionInfoNode): string | null {
  return readPath(findPlayerDriver(doc), 'UserName') ?? null;
}

/** O tipo da sessão que está gravada (treino, classificação, corrida). */
export function toSessionType(doc: SessionInfoNode): string | null {
  const sessionInfo = doc.SessionInfo;
  const current = readPath(sessionInfo, 'CurrentSessionNum');
  const sessions = asArray(
    typeof sessionInfo === 'object' && !Array.isArray(sessionInfo)
      ? sessionInfo?.Sessions
      : undefined,
  );
  const session = sessions.find((item) => readPath(item, 'SessionNum') === current) ?? sessions[0];

  return readPath(session, 'SessionType') ?? null;
}

/** `"5:50 pm"` → segundos desde a meia-noite. Formato do campo `TimeOfDay`. */
export function parseTimeOfDay(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(value.trim());
  if (match === null) return null;

  const [, rawHour, rawMinute, meridiem] = match;
  let hour = Number(rawHour);
  if (meridiem?.toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (meridiem?.toLowerCase() === 'am' && hour === 12) hour = 0;

  return hour * 3600 + Number(rawMinute) * 60;
}

export function toConditions(doc: SessionInfoNode): SessionConditions {
  const weekend = doc.WeekendInfo;
  const options =
    typeof weekend === 'object' && !Array.isArray(weekend) ? weekend?.WeekendOptions : undefined;

  return {
    ...UNKNOWN_CONDITIONS,
    airTempCelsius: readNumber(readPath(weekend, 'TrackAirTemp')),
    // A do "crew" é a medida de pista que o sim mostra ao engenheiro; a outra é
    // a da superfície exposta ao sol, sempre mais alta.
    trackTempCelsius: readNumber(readPath(weekend, 'TrackSurfaceTempCrew')),
    relativeHumidityPct: readNumber(readPath(weekend, 'TrackRelativeHumidity')),
    windSpeedMs: readNumber(readPath(weekend, 'TrackWindVel')),
    skies: readPath(weekend, 'TrackSkies') ?? null,
    timeOfDaySeconds: parseTimeOfDay(readPath(options, 'TimeOfDay')),
    trackUsage: readPath(weekend, 'TrackDynamicTrack') === null ? null : trackUsage(doc),
  };
}

/** O estado da borracha vem no bloco da sessão corrente, não no do fim de semana. */
function trackUsage(doc: SessionInfoNode): string | null {
  const sessionInfo = doc.SessionInfo;
  const sessions = asArray(
    typeof sessionInfo === 'object' && !Array.isArray(sessionInfo)
      ? sessionInfo?.Sessions
      : undefined,
  );
  const current = readPath(sessionInfo, 'CurrentSessionNum');
  const session = sessions.find((item) => readPath(item, 'SessionNum') === current) ?? sessions[0];

  return readPath(session, 'SessionTrackRubberState') ?? null;
}

/**
 * Chaves do bloco `CarSetup` que são contabilidade do sim, não ajuste do carro.
 * `UpdateCount` conta quantas vezes o bloco foi reescrito.
 */
const SETUP_BOOKKEEPING = new Set(['UpdateCount']);

/**
 * O acerto do carro, como árvore — a ficha muda de carro para carro, e nada
 * aqui presume quais seções existem. `null` quando o arquivo não traz o bloco
 * (série de acerto fixo o esconde).
 */
export function toCarSetup(doc: SessionInfoNode): SetupNode[] | null {
  const setup = doc.CarSetup;
  if (setup === undefined || typeof setup !== 'object' || Array.isArray(setup)) return null;

  const nodes = Object.entries(setup)
    .filter(([key]) => !SETUP_BOOKKEEPING.has(key))
    .map(([key, value]) => toSetupNode(key, value));
  return nodes.length > 0 ? nodes : null;
}

function toSetupNode(key: string, value: SessionInfoValue): SetupNode {
  if (typeof value === 'string') return { key, value, children: [] };
  if (Array.isArray(value)) {
    // Lista dentro do acerto é rara; cada item vira um filho numerado a partir
    // de 1, na ordem em que o sim escreveu.
    return {
      key,
      value: null,
      children: value.map((item, indice) => toSetupNode(String(indice + 1), item)),
    };
  }
  return {
    key,
    value: null,
    children: Object.entries(value).map(([filho, valor]) => toSetupNode(filho, valor)),
  };
}

/** Rotação de corte, de troca de marcha e capacidade do tanque, do próprio sim. */
export function toCarLimits(doc: SessionInfoNode): CarLimits {
  const driverInfo = doc.DriverInfo;
  return {
    redlineRpm: readNumber(readPath(driverInfo, 'DriverCarRedLine')),
    shiftRpm: readNumber(readPath(driverInfo, 'DriverCarSLShiftRPM')),
    fuelCapacityLiters: readNumber(readPath(driverInfo, 'DriverCarFuelMaxLtr')),
  };
}

/**
 * Onde cada setor da pista começa, do bloco `SplitTimeInfo.Sectors`:
 *
 * ```yaml
 * SplitTimeInfo:
 *  Sectors:
 *  - SectorNum: 0
 *    SectorStartPct: 0.000000
 *  - SectorNum: 1
 *    SectorStartPct: 0.167875
 * ```
 *
 * Conferido contra um `.ibt` real de Road Atlanta (2026-09-24). Ordena pelo
 * número do setor, não pela ordem do texto. Bloco ausente, ou setores fora de
 * forma (não começa na linha, não cresce), devolve `null` — setor torto daria
 * tempo de setor plausível e errado.
 */
export function toSectorStarts(doc: SessionInfoNode): SectorStarts | null {
  const split = doc.SplitTimeInfo;
  const sectors = asArray(
    typeof split === 'object' && !Array.isArray(split) ? split?.Sectors : undefined,
  );

  const lidos = sectors.map((sector) => ({
    num: readNumber(readPath(sector, 'SectorNum')),
    start: readNumber(readPath(sector, 'SectorStartPct')),
  }));
  if (lidos.length === 0 || lidos.some((s) => s.num === null || s.start === null)) return null;

  const starts = lidos
    .sort((a, b) => (a.num as number) - (b.num as number))
    .map((s) => s.start as number);
  return isValidSectorStarts(starts) ? starts : null;
}

/** Data e hora reais em que a gravação começou. */
export function toRecordedAt(startDate: bigint): Date | null {
  const seconds = Number(startDate);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}
