import { type AnalysisReport, NotFoundError } from '@telemetry/domain';
import type {
  AnalysisReportKey,
  AnalysisReportReaderPort,
} from '../ports/analysis-report-store.port.js';

export interface GetLapAnalysisDeps {
  readonly reports: AnalysisReportReaderPort;
}

export type GetLapAnalysisQuery = (request: AnalysisReportKey) => Promise<AnalysisReport>;

/**
 * Lê o relatório já gerado. Nunca chama o modelo.
 *
 * Quem gera é `RequestLapAnalysis` — ver `docs/adr/0010-cqs-na-aplicacao.md`.
 */
export function createGetLapAnalysisQuery(deps: GetLapAnalysisDeps): GetLapAnalysisQuery {
  return async (key) => {
    const report = await deps.reports.find(key);
    if (report === null) {
      throw new NotFoundError(
        `Nenhuma análise da volta ${key.lapNumber} contra a referência ${key.referenceLapId}`,
      );
    }
    return report;
  };
}
