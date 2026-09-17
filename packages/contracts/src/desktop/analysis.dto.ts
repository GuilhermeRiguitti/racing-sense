import type { AnalysisReport, LapComparison } from '@telemetry/domain';
import { z } from 'zod';

export const seriesDto = z.object({
  channel: z.string(),
  unit: z.string(),
  axis: z.enum(['time', 'lapDistPct']),
  x: z.array(z.number()),
  y: z.array(z.number()),
});

export const comparisonDto = z.object({
  referenceLapId: z.string(),
  lapNumber: z.int(),
  totalDeltaSeconds: z.number(),
  deltaSeries: seriesDto,
  segments: z.array(
    z.object({
      startDistPct: z.number().min(0).max(1),
      endDistPct: z.number().min(0).max(1),
      deltaSeconds: z.number(),
      label: z.string().nullable(),
    }),
  ),
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
    deltaSeries: {
      channel: comparison.deltaSeries.channel,
      unit: comparison.deltaSeries.unit,
      axis: comparison.deltaSeries.axis,
      x: [...comparison.deltaSeries.x],
      y: [...comparison.deltaSeries.y],
    },
    segments: comparison.segments.map((segment) => ({ ...segment })),
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
