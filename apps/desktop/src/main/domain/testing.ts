/**
 * Construtores de dados para teste.
 *
 * Ficam junto do domínio, e não em cada arquivo de teste, para que a forma de um
 * `ReferenceLap` válido seja definida num lugar só. Quando uma invariante mudar,
 * quebra aqui — não em quinze arquivos de teste.
 */

import { UNKNOWN_CAR_LIMITS } from './car-setup.js';
import { type ChannelSeries, createChannelSeries } from './channel.js';
import { type SessionConditions, UNKNOWN_CONDITIONS } from './conditions.js';
import { toReferenceLapId, toSessionId } from './id.js';
import type { Lap } from './lap.js';
import type { ReferenceLap } from './reference-lap.js';
import type { CarRef, TelemetrySession, TrackRef } from './session.js';

export const aTrack = (overrides: Partial<TrackRef> = {}): TrackRef => ({
  id: 'interlagos',
  name: 'Autódromo José Carlos Pace',
  config: 'Grand Prix',
  lengthMeters: 5754,
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
  flags: [],
  ...overrides,
});

export const aSeries = (overrides: Partial<ChannelSeries> = {}): ChannelSeries =>
  createChannelSeries({
    channel: 'Speed',
    unit: 'm/s',
    type: 'number',
    axis: 'lapDistPct',
    x: [0, 0.5, 1],
    y: [40, 62, 38],
    ...overrides,
  });

export const someConditions = (overrides: Partial<SessionConditions> = {}): SessionConditions => ({
  ...UNKNOWN_CONDITIONS,
  airTempCelsius: 25.5,
  trackTempCelsius: 32.1,
  skies: 'Partly Cloudy',
  timeOfDaySeconds: 14 * 3600,
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
  conditions: someConditions(),
  setup: null,
  carLimits: UNKNOWN_CAR_LIMITS,
  sectorStartPcts: null,
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
