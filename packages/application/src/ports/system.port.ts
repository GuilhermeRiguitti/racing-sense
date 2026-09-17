import type { AnalysisReportId, ReferenceLapId, SessionId } from '@telemetry/domain';

/**
 * Relógio e gerador de id como portas.
 *
 * `new Date()` e `crypto.randomUUID()` espalhados pelo caso de uso tornam o
 * teste dependente do relógio e do acaso. Injetados, o teste fixa os dois.
 */
export interface ClockPort {
  now(): Date;
}

export interface IdGeneratorPort {
  nextSessionId(): SessionId;
  nextReferenceLapId(): ReferenceLapId;
  nextAnalysisReportId(): AnalysisReportId;
}
