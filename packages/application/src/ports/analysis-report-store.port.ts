import type { AnalysisReport, ReferenceLapId, SessionId } from '@telemetry/domain';

export interface AnalysisReportKey {
  readonly sessionId: SessionId;
  readonly lapNumber: number;
  readonly referenceLapId: ReferenceLapId;
}

export interface AnalysisReportReaderPort {
  find(key: AnalysisReportKey): Promise<AnalysisReport | null>;
}

export interface AnalysisReportWriterPort {
  save(report: AnalysisReport): Promise<void>;
}
