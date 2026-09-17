import type {
  AnalysisReportKey,
  AnalysisReportReaderPort,
  AnalysisReportWriterPort,
} from '@telemetry/application';
import type { AnalysisReport } from '@telemetry/domain';

const keyOf = (key: AnalysisReportKey): string =>
  `${key.sessionId}::${key.lapNumber}::${key.referenceLapId}`;

export function createInMemoryAnalysisReportStore(): AnalysisReportReaderPort &
  AnalysisReportWriterPort {
  const stored = new Map<string, AnalysisReport>();

  return {
    async find(key: AnalysisReportKey) {
      return stored.get(keyOf(key)) ?? null;
    },

    async save(report: AnalysisReport) {
      stored.set(keyOf(report), report);
    },
  };
}
