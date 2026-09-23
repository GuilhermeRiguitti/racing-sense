import type { AnalysisReport, ChannelSeries, LapComparison } from '@telemetry/domain';
import { z } from 'zod';

export const seriesDto = z.object({
  channel: z.string(),
  unit: z.string(),
  /**
   * Viaja até a tela: quem desenha precisa saber se pode ligar dois pontos com
   * uma reta (contínuo) ou se tem que desenhar degrau (marcha, booleano).
   */
  type: z.enum(['number', 'integer', 'boolean', 'text', 'bitfield']),
  axis: z.enum(['time', 'lapDistPct']),
  x: z.array(z.number()),
  y: z.array(z.number()),
});
export type SeriesDto = z.infer<typeof seriesDto>;

export function toSeriesDto(series: ChannelSeries): SeriesDto {
  return {
    channel: series.channel,
    unit: series.unit,
    type: series.type,
    axis: series.axis,
    x: [...series.x],
    y: [...series.y],
  };
}

export const comparisonDto = z.object({
  referenceLapId: z.string(),
  lapNumber: z.int(),
  totalDeltaSeconds: z.number(),
  deltaSeries: seriesDto,
});
export type ComparisonDto = z.infer<typeof comparisonDto>;

export const analysisReportDto = z.object({
  sessionId: z.string(),
  lapNumber: z.int(),
  referenceLapId: z.string(),
  summary: z.string(),
  findings: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      startDistPct: z.number().min(0).max(1),
      endDistPct: z.number().min(0).max(1),
      deltaSeconds: z.number().nullable(),
      /** Achado sem canal de evidência não passa daqui. */
      evidenceChannels: z.array(z.string()).min(1),
      confidence: z.enum(['low', 'medium', 'high']),
    }),
  ),
  model: z.string(),
  generatedAt: z.iso.datetime(),
});
export type AnalysisReportDto = z.infer<typeof analysisReportDto>;

export function toComparisonDto(comparison: LapComparison): ComparisonDto {
  return {
    referenceLapId: comparison.referenceLapId,
    lapNumber: comparison.lapNumber,
    totalDeltaSeconds: comparison.totalDeltaSeconds,
    deltaSeries: toSeriesDto(comparison.deltaSeries),
  };
}

export function toAnalysisReportDto(report: AnalysisReport): AnalysisReportDto {
  return {
    sessionId: report.sessionId,
    lapNumber: report.lapNumber,
    referenceLapId: report.referenceLapId,
    summary: report.summary,
    findings: report.findings.map((finding) => ({
      ...finding,
      evidenceChannels: [...finding.evidenceChannels],
    })),
    model: report.model,
    generatedAt: report.generatedAt.toISOString(),
  };
}
