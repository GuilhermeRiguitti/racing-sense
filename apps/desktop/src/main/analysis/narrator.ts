import { NotImplementedError } from '../domain/errors.js';
import type { AnalysisFinding } from '../domain/insight.js';
import type { LapComparison } from '../domain/lap-comparison.js';
import { type LlmConfig, loadLlmConfigFromEnv } from './llm-config.js';

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
 * prontos. Roda no desktop, direto contra o provedor — sem passar pela api
 * (regra 11): o coach responde na hora e funciona sem a nuvem de pé.
 */
export type Narrate = (request: NarrationRequest) => Promise<Narration>;

/**
 * Narrador baseado em LLM.
 *
 * Trocar Gemini por NVIDIA é variável de ambiente (ver `llm-config.ts`); o
 * modelo é montado por `resolveModel`, em `llm-provider.ts`.
 */
export function createLlmNarrator(_config: LlmConfig): Narrate {
  return () =>
    Promise.reject(
      new NotImplementedError(
        'Narrador ainda não implementado: o delta já chega calculado; falta a redação (etapa 5 do roadmap)',
      ),
    );
}

/**
 * Narrador que recusa trabalhar.
 *
 * Usado quando não há chave de API configurada. Falha explícita na hora de
 * narrar é melhor que a aplicação nem subir por causa de uma funcionalidade
 * opcional.
 */
export function createUnavailableNarrator(reason: string): Narrate {
  return () => Promise.reject(new NotImplementedError(`Narrador indisponível: ${reason}`));
}

/** Sem chave, o app abre igual: só a análise por modelo fica indisponível, com motivo. */
export function narratorFromEnv(env: Record<string, string | undefined>): Narrate {
  try {
    return createLlmNarrator(loadLlmConfigFromEnv(env));
  } catch (error) {
    return createUnavailableNarrator(
      error instanceof Error ? error.message : 'configuração ausente',
    );
  }
}
