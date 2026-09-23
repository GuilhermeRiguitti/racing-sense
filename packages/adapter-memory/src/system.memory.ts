import type { ClockPort, IdGeneratorPort } from '@telemetry/application';
import {
  type AnalysisReportId,
  type ReferenceLapId,
  type SessionId,
  toAnalysisReportId,
  toReferenceLapId,
  toSessionId,
} from '@telemetry/domain';

/** Relógio parado. Teste que depende de `new Date()` é teste que falha sozinho. */
export function createFixedClock(now: Date): ClockPort {
  return { now: () => now };
}

/** Ids previsíveis: `session-1`, `session-2`, ... */
export function createSequentialIdGenerator(): IdGeneratorPort {
  const counters = { session: 0, reference: 0, report: 0 };

  return {
    nextSessionId(): SessionId {
      counters.session += 1;
      return toSessionId(`session-${counters.session}`);
    },
    nextReferenceLapId(): ReferenceLapId {
      counters.reference += 1;
      return toReferenceLapId(`reference-${counters.reference}`);
    },
    nextAnalysisReportId(): AnalysisReportId {
      counters.report += 1;
      return toAnalysisReportId(`report-${counters.report}`);
    },
  };
}
