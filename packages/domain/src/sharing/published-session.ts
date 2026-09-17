import type { PilotId } from '../pilot/pilot.js';
import type { Lap } from '../telemetry/lap.js';
import type { TelemetrySession } from '../telemetry/session.js';
import type { ShareLink, Visibility } from './visibility.js';

/**
 * Uma sessão como ela existe na nuvem: a gravação mais quem é o dono e quem pode ver.
 *
 * A gravação (`TelemetrySession`) não sabe de dono nem de visibilidade — na
 * máquina do piloto isso não existe. Publicação é um conceito da nuvem, e fica
 * separado de propósito.
 */
export interface PublishedSession {
  readonly session: TelemetrySession;
  readonly laps: readonly Lap[];
  readonly ownerId: PilotId;
  readonly visibility: Visibility;
  readonly shareLinks: readonly ShareLink[];
  readonly publishedAt: Date;
}

/** O que aparece numa listagem: sem séries, sem volta a volta. */
export interface PublishedSessionSummary {
  readonly sessionId: TelemetrySession['id'];
  readonly ownerId: PilotId;
  readonly trackName: string;
  readonly carName: string;
  readonly visibility: Visibility;
  readonly bestLapTimeSeconds: number | null;
  readonly lapCount: number;
  readonly recordedAt: Date | null;
}
