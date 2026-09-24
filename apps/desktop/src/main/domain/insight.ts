import type { ReferenceLapId, SessionId } from './id.js';

/**
 * Um achado do narrador.
 *
 * Sempre ancorado em evidência: trecho da volta e canais que sustentam a
 * afirmação. Achado sem canal é conselho genérico de coach, e o domínio recusa.
 */
export interface AnalysisFinding {
  readonly title: string;
  readonly detail: string;
  readonly startDistPct: number;
  readonly endDistPct: number;
  readonly deltaSeconds: number | null;
  readonly evidenceChannels: readonly string[];
  readonly confidence: 'low' | 'medium' | 'high';
}

/** Relatório produzido para uma volta, contra uma referência. */
export interface AnalysisReport {
  readonly sessionId: SessionId;
  readonly lapNumber: number;
  readonly referenceLapId: ReferenceLapId;
  readonly summary: string;
  readonly findings: readonly AnalysisFinding[];
  /** Rastreabilidade: qual modelo escreveu isto. */
  readonly model: string;
  readonly generatedAt: Date;
}

export function hasEvidence(finding: AnalysisFinding): boolean {
  return finding.evidenceChannels.length > 0;
}
