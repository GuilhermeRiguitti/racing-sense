import type { Lap, TelemetrySession } from '@telemetry/domain';
import { z } from 'zod';

/**
 * DTOs da borda HTTP.
 *
 * Este pacote é o **único** lugar onde `zod` aparece. O domínio não conhece
 * schema de validação, e a aplicação não conhece JSON: trocar zod por outra lib
 * de validação, ou JSON por outro formato, para neste pacote.
 *
 * O DTO também protege o front: mudar um campo interno do domínio não quebra a
 * API sem alguém mexer no mapper aqui e perceber.
 */
export const channelDto = z.object({
  name: z.string(),
  description: z.string(),
  unit: z.string(),
  type: z.enum(['number', 'boolean', 'text', 'bitfield']),
  valuesPerSample: z.int().positive(),
});

export const conditionsDto = z.object({
  airTempCelsius: z.number().nullable(),
  trackTempCelsius: z.number().nullable(),
  relativeHumidityPct: z.number().nullable(),
  windSpeedMs: z.number().nullable(),
  skies: z.string().nullable(),
  timeOfDaySeconds: z.number().nullable(),
  trackUsage: z.string().nullable(),
});

export const sessionDto = z.object({
  id: z.string(),
  trackName: z.string(),
  trackConfig: z.string().nullable(),
  carName: z.string(),
  driverName: z.string().nullable(),
  sessionType: z.string().nullable(),
  recordedAt: z.iso.datetime().nullable(),
  tickRate: z.int().positive(),
  sampleCount: z.int().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  /** Temperatura, horário e céu viajam com a sessão: sem isso a comparação mente. */
  conditions: conditionsDto,
  channels: z.array(channelDto),
});
export type SessionDto = z.infer<typeof sessionDto>;

export const lapDto = z.object({
  number: z.int(),
  startSample: z.int().nonnegative(),
  endSample: z.int().nonnegative(),
  lapTimeSeconds: z.number().positive().nullable(),
  isComplete: z.boolean(),
});
export type LapDto = z.infer<typeof lapDto>;

export function toSessionDto(session: TelemetrySession): SessionDto {
  return {
    id: session.id,
    trackName: session.track.name,
    trackConfig: session.track.config,
    carName: session.car.name,
    driverName: session.driverName,
    sessionType: session.sessionType,
    recordedAt: session.recordedAt?.toISOString() ?? null,
    tickRate: session.tickRate,
    sampleCount: session.sampleCount,
    durationSeconds: session.sampleCount / session.tickRate,
    conditions: { ...session.conditions },
    channels: session.channels.map((channel) => ({ ...channel })),
  };
}

export function toLapDto(lap: Lap): LapDto {
  return {
    number: lap.number,
    startSample: lap.startSample,
    endSample: lap.endSample,
    lapTimeSeconds: lap.lapTimeSeconds,
    isComplete: lap.isComplete,
  };
}
