import {
  type CarRef,
  type SessionConditions,
  type TrackRef,
  UNKNOWN_CONDITIONS,
} from '@telemetry/domain';
import {
  readNumber,
  readPath,
  type SessionInfoNode,
  type SessionInfoValue,
} from '@telemetry/ibt-core';

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

  return {
    id,
    name: readPath(weekend, 'TrackDisplayName') ?? id,
    config: readPath(weekend, 'TrackConfigName') ?? null,
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

/** Data e hora reais em que a gravação começou. */
export function toRecordedAt(startDate: bigint): Date | null {
  const seconds = Number(startDate);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}
