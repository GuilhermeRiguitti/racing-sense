import type { PublishedSessionSummary } from '@telemetry/domain';
import { z } from 'zod';
import { lapDto, sessionDto } from '../desktop/session.dto.js';
import { visibilityDto } from './auth.dto.js';

/**
 * O que o desktop envia para a nuvem.
 *
 * Sobe a sessão inteira — metadados, condições, voltas e séries — porque a
 * publicação é automática (ADR 0013). O que **não** sobe é o `.ibt`: arquivo
 * grande, e o dado derivado já contém tudo que a rede social usa.
 *
 * A sessão nasce com a visibilidade padrão da conta, que é `private`. Abrir é
 * ação explícita do piloto no painel da web.
 */
export const publishSessionRequest = z.object({
  session: sessionDto,
  laps: z.array(lapDto),
  seriesByLap: z.array(
    z.object({
      lapNumber: z.int(),
      series: z.array(
        z.object({
          channel: z.string(),
          unit: z.string(),
          axis: z.enum(['time', 'lapDistPct']),
          x: z.array(z.number()),
          y: z.array(z.number()),
        }),
      ),
    }),
  ),
});
export type PublishSessionRequest = z.infer<typeof publishSessionRequest>;

export const publishedSessionSummaryDto = z.object({
  sessionId: z.string(),
  ownerId: z.string(),
  trackName: z.string(),
  carName: z.string(),
  visibility: visibilityDto,
  bestLapTimeSeconds: z.number().positive().nullable(),
  lapCount: z.int().nonnegative(),
  recordedAt: z.iso.datetime().nullable(),
});
export type PublishedSessionSummaryDto = z.infer<typeof publishedSessionSummaryDto>;

export const setVisibilityRequest = z.object({ visibility: visibilityDto });
export type SetVisibilityRequest = z.infer<typeof setVisibilityRequest>;

export const shareLinkDto = z.object({
  token: z.string(),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});

export function toPublishedSessionSummaryDto(
  summary: PublishedSessionSummary,
): PublishedSessionSummaryDto {
  return {
    sessionId: summary.sessionId,
    ownerId: summary.ownerId,
    trackName: summary.trackName,
    carName: summary.carName,
    visibility: summary.visibility,
    bestLapTimeSeconds: summary.bestLapTimeSeconds,
    lapCount: summary.lapCount,
    recordedAt: summary.recordedAt?.toISOString() ?? null,
  };
}
