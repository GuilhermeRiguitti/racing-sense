import type { DesktopEvent } from '../../shared/ipc.js';
import type { LocalStore } from '../db/local-store.js';
import { NotFoundError } from '../domain/errors.js';
import type { SessionId } from '../domain/id.js';
import { isValidLap } from '../domain/lap.js';
import { type ApiClient, type ApiSchemas, call } from './api-client.js';

export interface PublicationContext {
  readonly store: LocalStore;
  readonly api: ApiClient;
  readonly emit: (event: DesktopEvent) => void;
}

export interface FlushResult {
  readonly published: number;
  readonly failed: number;
}

/**
 * Monta o corpo da publicação a partir do banco local.
 *
 * Sobe a sessão inteira — metadados, condições, voltas e séries — porque a
 * publicação é automática (ADR 0013). O que **não** sobe é o `.ibt` nem o
 * caminho dele: o caminho tem o nome de usuário do Windows dentro.
 *
 * A melhor volta é calculada aqui, com a regra do domínio: a api recebe o
 * número pronto e não reinterpreta telemetria (regra 9).
 */
export function buildPublication(
  store: LocalStore,
  sessionId: SessionId,
): ApiSchemas['PublishSessionDto'] {
  const session = store.findSession(sessionId);
  if (session === null) {
    throw new NotFoundError(`Sessão ${sessionId} não existe localmente`);
  }
  const laps = store.listLaps(sessionId);
  const validTimes = laps
    .filter(isValidLap)
    .map((lap) => lap.lapTimeSeconds)
    .filter((time): time is number => time !== null);

  return {
    id: session.id,
    trackId: session.track.id,
    trackName: session.track.name,
    trackConfig: session.track.config,
    trackLengthMeters: session.track.lengthMeters,
    carId: session.car.id,
    carName: session.car.name,
    driverName: session.driverName,
    sessionType: session.sessionType,
    recordedAt: session.recordedAt?.toISOString() ?? null,
    tickRate: session.tickRate,
    sampleCount: session.sampleCount,
    conditions: { ...session.conditions },
    bestLapTimeSeconds: validTimes.length > 0 ? Math.min(...validTimes) : null,
    laps: laps.map((lap) => ({
      number: lap.number,
      startSample: lap.startSample,
      endSample: lap.endSample,
      lapTimeSeconds: lap.lapTimeSeconds,
      isComplete: lap.isComplete,
      flags: [...lap.flags],
      series: store.readLapSeries(sessionId, lap.number).map((serie) => ({
        channel: serie.channel,
        unit: serie.unit,
        type: serie.type,
        axis: serie.axis,
        x: [...serie.x],
        y: [...serie.y],
      })),
    })),
  };
}

/**
 * Tenta enviar para a api o que está na fila.
 *
 * Roda em segundo plano, fora do caminho de qualquer coisa que o piloto esteja
 * fazendo. Falha de rede **não é erro do usuário**: a sessão continua na fila e
 * a próxima rodada tenta de novo. É isso que faz o app do Windows ser autônomo
 * de verdade (regra 10).
 */
export async function flushPublicationQueue(
  { store, api, emit }: PublicationContext,
  batchSize = 10,
): Promise<FlushResult> {
  let published = 0;
  let failed = 0;

  for (const sessionId of store.pendingPublications(batchSize)) {
    try {
      const body = buildPublication(store, sessionId);
      await call('publicar sessão', () => api.POST('/sessions', { body }));
      store.markPublished(sessionId);
      published += 1;
    } catch (error) {
      // Uma sessão que falha não pode impedir as outras de subir.
      store.markPublicationFailed(
        sessionId,
        error instanceof Error ? error.message : 'falha desconhecida',
      );
      failed += 1;
    }
  }

  // Rodada silenciosa não vira evento: a fila trabalha em segundo plano e não
  // deve piscar nada na tela quando não há o que contar.
  if (published > 0 || failed > 0) {
    emit({ type: 'publication-progressed', published, failed });
  }

  return { published, failed };
}
