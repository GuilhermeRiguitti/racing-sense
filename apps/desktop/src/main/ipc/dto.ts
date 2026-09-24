import type {
  AnalysisReportDto,
  ComparisonDto,
  LapDto,
  LapFlagDto,
  ReferenceLapDto,
  SeriesDto,
  SessionDto,
} from '../../shared/dto.js';
import type { ChannelSeries } from '../domain/channel.js';
import type { AnalysisReport } from '../domain/insight.js';
import type { Lap, LapFlag } from '../domain/lap.js';
import type { LapComparison } from '../domain/lap-comparison.js';
import type { ReferenceLap } from '../domain/reference-lap.js';
import type { TelemetrySession } from '../domain/session.js';

/**
 * Marcação nova no domínio sem a tela acompanhar vira erro de compilação aqui,
 * não DTO silenciosamente desatualizado.
 */
type FlagsIguais = [LapFlag] extends [LapFlagDto]
  ? [LapFlagDto] extends [LapFlag]
    ? true
    : never
  : never;
const _flagsCobertas: FlagsIguais = true;
void _flagsCobertas;

export function toSessionDto(session: TelemetrySession): SessionDto {
  return {
    id: session.id,
    trackName: session.track.name,
    trackConfig: session.track.config,
    trackLengthMeters: session.track.lengthMeters,
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
    flags: [...lap.flags],
  };
}

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

export function toComparisonDto(comparison: LapComparison): ComparisonDto {
  return {
    referenceLapId: comparison.referenceLapId,
    lapNumber: comparison.lapNumber,
    totalDeltaSeconds: comparison.totalDeltaSeconds,
    deltaSeries: toSeriesDto(comparison.deltaSeries),
  };
}

export function toReferenceLapDto(reference: ReferenceLap): ReferenceLapDto {
  return {
    id: reference.id,
    label: reference.label,
    trackName: reference.track.name,
    carName: reference.car.name,
    lapNumber: reference.lap.number,
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
