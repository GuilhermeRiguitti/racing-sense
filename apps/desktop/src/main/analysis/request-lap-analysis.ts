import type { DesktopEvent } from '../../shared/ipc.js';
import type { LocalStore } from '../db/local-store.js';
import { NotFoundError } from '../domain/errors.js';
import type { AnalysisReport } from '../domain/insight.js';
import { compareToReference } from '../domain/lap-comparison.js';
import { type LapAgainstReference, requireReferenceLap } from './compare-lap.js';
import { requireSession, requireValidLap } from './laps.js';
import type { Narrate } from './narrator.js';

export interface AnalysisContext {
  readonly store: LocalStore;
  readonly narrate: Narrate;
  readonly emit: (event: DesktopEvent) => void;
}

/**
 * Pede ao narrador uma análise da volta contra a referência e guarda o resultado.
 *
 * Gerar e ler são separados: chamar o modelo custa dinheiro e o relatório é
 * persistido, então quem quer o texto usa `getLapAnalysis` — nunca dispara o
 * modelo de novo por ter aberto a tela.
 *
 * O cálculo do delta acontece no domínio, antes do modelo entrar: o narrador
 * recebe números prontos e só redige (regra 17).
 */
export async function requestLapAnalysis(
  { store, narrate, emit }: AnalysisContext,
  { sessionId, lapNumber, referenceLapId }: LapAgainstReference,
): Promise<void> {
  const session = requireSession(store, sessionId);
  const reference = requireReferenceLap(store, referenceLapId);
  // Recusa antes de gastar chamada de modelo (ADR 0018).
  const lap = requireValidLap(store, sessionId, lapNumber, 'não é válida');

  const series = store.readLapSeries(sessionId, lapNumber);
  const comparison = compareToReference(reference, {
    track: session.track,
    car: session.car,
    lap,
    series,
  });

  const narration = await narrate({
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
    generatedAt: new Date(),
  };

  store.saveAnalysisReport(report);

  // A análise pode demorar; o piloto pode ter ido olhar outra volta enquanto
  // isso. O evento traz ele de volta em vez de exigir que fique esperando.
  emit({ type: 'analysis-ready', sessionId, lapNumber, referenceLapId });
}

/** Lê o relatório já gerado. Nunca chama o modelo. */
export function getLapAnalysis(store: LocalStore, key: LapAgainstReference): AnalysisReport {
  const report = store.findAnalysisReport(key);
  if (report === null) {
    throw new NotFoundError(
      `Nenhuma análise da volta ${key.lapNumber} contra a referência ${key.referenceLapId}`,
    );
  }
  return report;
}
