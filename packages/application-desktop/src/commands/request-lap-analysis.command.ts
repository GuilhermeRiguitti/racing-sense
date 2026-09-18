import type { ClockPort } from '@telemetry/application';
import {
  type AnalysisReport,
  compareToReference,
  NotFoundError,
  type ReferenceLapId,
  type SessionId,
} from '@telemetry/domain';
import type { AnalysisReportWriterPort } from '../ports/analysis-report-store.port.js';
import type { EventPublisherPort } from '../ports/event-publisher.port.js';
import type { NarratorPort } from '../ports/narrator.port.js';
import type { ReferenceLapReaderPort } from '../ports/reference-lap-store.port.js';
import type { SessionReaderPort } from '../ports/session-store.port.js';

export interface RequestLapAnalysisCommand {
  readonly sessionId: SessionId;
  readonly lapNumber: number;
  readonly referenceLapId: ReferenceLapId;
}

export interface RequestLapAnalysisDeps {
  readonly sessions: SessionReaderPort;
  readonly referenceLaps: ReferenceLapReaderPort;
  readonly reports: AnalysisReportWriterPort;
  readonly narrator: NarratorPort;
  readonly clock: ClockPort;
  readonly events: EventPublisherPort;
}

export type RequestLapAnalysisHandler = (command: RequestLapAnalysisCommand) => Promise<void>;

/**
 * Pede ao narrador uma análise da volta contra a referência e guarda o resultado.
 *
 * É comando, não query, apesar de "produzir texto": chamar o modelo custa
 * dinheiro e o relatório é persistido. Quem quer ler o resultado usa
 * `GetLapAnalysis`. Ver `docs/adr/0010-cqs-na-aplicacao.md`.
 *
 * O cálculo do delta acontece no domínio, antes do modelo entrar: o narrador
 * recebe números prontos e só redige.
 */
export function createRequestLapAnalysisHandler(
  deps: RequestLapAnalysisDeps,
): RequestLapAnalysisHandler {
  return async ({ sessionId, lapNumber, referenceLapId }) => {
    const [session, reference] = await Promise.all([
      deps.sessions.findById(sessionId),
      deps.referenceLaps.findById(referenceLapId),
    ]);
    if (session === null) {
      throw new NotFoundError(`Sessão ${sessionId} não encontrada`);
    }
    if (reference === null) {
      throw new NotFoundError(`Volta de referência ${referenceLapId} não encontrada`);
    }

    const laps = await deps.sessions.listLaps(sessionId);
    const lap = laps.find((candidate) => candidate.number === lapNumber);
    if (lap === undefined) {
      throw new NotFoundError(`Volta ${lapNumber} não existe na sessão ${sessionId}`);
    }

    const series = await deps.sessions.readLapSeries(sessionId, lapNumber);
    const comparison = compareToReference(reference, {
      track: session.track,
      car: session.car,
      lap,
      series,
    });

    const narration = await deps.narrator.narrate({
      comparison,
      evidence: new Map(series.map((channel) => [channel.channel, channel.y])),
    });

    const report: AnalysisReport = {
      sessionId,
      lapNumber,
      referenceLapId,
      summary: narration.summary,
      findings: narration.findings,
      model: narration.model,
      generatedAt: deps.clock.now(),
    };

    await deps.reports.save(report);

    // A análise pode demorar; o piloto pode ter ido olhar outra volta enquanto
    // isso. O evento traz ele de volta em vez de exigir que fique esperando.
    deps.events.publish({
      type: 'analysis-ready',
      sessionId,
      lapNumber,
      referenceLapId,
    });
  };
}
