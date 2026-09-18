import type { AnalysisFinding, LapComparison } from '@telemetry/domain';

/** O que o narrador recebe: números já calculados, nunca telemetria crua. */
export interface NarrationRequest {
  readonly comparison: LapComparison;
  /** Trechos de canal já reduzidos, para o narrador olhar onde importa. */
  readonly evidence: ReadonlyMap<string, readonly number[]>;
}

export interface Narration {
  readonly summary: string;
  readonly findings: readonly AnalysisFinding[];
  /** Qual modelo escreveu. Rastreabilidade de custo e de qualidade. */
  readonly model: string;
}

/**
 * Redação da análise em linguagem natural.
 *
 * O narrador **não calcula**: delta, tempo de volta e recorte de trecho chegam
 * prontos. Trocar Gemini por NVIDIA, ou o AI SDK por outra lib, é trocar quem
 * implementa esta porta — nenhum caso de uso muda.
 */
export interface NarratorPort {
  narrate(request: NarrationRequest): Promise<Narration>;
}
