/**
 * Construtores de dados para teste.
 *
 * Ficam no domínio, e não em cada pacote de teste, para que a forma de um
 * `ReferenceLap` válido seja definida num lugar só. Quando uma invariante mudar,
 * quebra aqui — não em quinze arquivos de teste.
 */

import type { ReferenceLap } from '../reference/reference-lap.js';
import { toReferenceLapId, toSessionId } from '../shared/id.js';
import { type ChannelSeries, createChannelSeries } from '../telemetry/channel.js';
import type { Lap } from '../telemetry/lap.js';
import type { CarRef, TelemetrySession, TrackRef } from '../telemetry/session.js';

export const aTrack = (overrides: Partial<TrackRef> = {}): TrackRef => ({
  id: 'interlagos',
  name: 'Autódromo José Carlos Pace',
  config: 'Grand Prix',
  ...overrides,
});

export const aCar = (overrides: Partial<CarRef> = {}): CarRef => ({
  id: 'formularenault20',
  name: 'Formula Renault 2.0',
  ...overrides,
});

export const aLap = (overrides: Partial<Lap> = {}): Lap => ({
  number: 3,
  startSample: 0,
  endSample: 4500,
  lapTimeSeconds: 75.2,
  isComplete: true,
  ...overrides,
});

export const aSeries = (overrides: Partial<ChannelSeries> = {}): ChannelSeries =>
  createChannelSeries({
    channel: 'Speed',
    unit: 'm/s',
    axis: 'lapDistPct',
    x: [0, 0.5, 1],
    y: [40, 62, 38],
    ...overrides,
  });

export const aSession = (overrides: Partial<TelemetrySession> = {}): TelemetrySession => ({
  id: toSessionId('session-1'),
  track: aTrack(),
  car: aCar(),
  driverName: 'Piloto Teste',
  sessionType: 'Practice',
  recordedAt: new Date('2026-09-17T12:00:00Z'),
  tickRate: 60,
  sampleCount: 3600,
  channels: [
    {
      name: 'Speed',
      description: 'GPS vehicle speed',
      unit: 'm/s',
      type: 'number',
      valuesPerSample: 1,
    },
  ],
  ...overrides,
});

export const aReferenceLap = (overrides: Partial<ReferenceLap> = {}): ReferenceLap => ({
  id: toReferenceLapId('reference-1'),
  label: 'Melhor volta do treino',
  origin: 'imported-file',
  track: aTrack(),
  car: aCar(),
  lap: aLap(),
  series: [aSeries()],
  ...overrides,
});
