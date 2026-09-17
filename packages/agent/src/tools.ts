import { z } from 'zod';

/**
 * Superfície de ferramentas que o agente pode chamar.
 *
 * Cada ferramenta é uma janela estreita para dados que já existem. Nenhuma delas
 * faz cálculo novo: elas leem o que `@telemetry/analysis` produziu.
 *
 * Por que ferramenta em vez de despejar tudo no prompt: uma volta a 60 Hz tem
 * dezenas de milhares de pontos por canal. Mandar isso inteiro é caro, lento e
 * degrada a resposta. O agente pede o trecho que interessa.
 */

/** Ainda não implementado — ver `docs/roadmap.md`. */
export class NotImplementedError extends Error {
  override readonly name = 'NotImplementedError';
}

export const listLapsInput = z.object({
  sessionId: z.string().describe('Sessão ingerida a consultar'),
});

export const getLapSummaryInput = z.object({
  sessionId: z.string(),
  lapNumber: z.int().describe('Número da volta como o sim reporta'),
});

export const getDeltaSegmentsInput = z.object({
  sessionId: z.string(),
  lapNumber: z.int(),
  referenceLapId: z.string().describe('Volta de referência importada'),
  minDeltaSeconds: z
    .number()
    .default(0.05)
    .describe('Ignora trechos cuja diferença é menor que isso'),
});

export const getChannelWindowInput = z.object({
  sessionId: z.string(),
  lapNumber: z.int(),
  channels: z.array(z.string()).min(1).max(6).describe('Canais, ex.: Brake, Throttle, Speed'),
  startDistPct: z.number().min(0).max(1),
  endDistPct: z.number().min(0).max(1),
  /** Teto de pontos por canal: o que volta é reduzido, nunca cru. */
  maxPoints: z.int().min(10).max(400).default(120),
});

export type ListLapsInput = z.infer<typeof listLapsInput>;
export type GetLapSummaryInput = z.infer<typeof getLapSummaryInput>;
export type GetDeltaSegmentsInput = z.infer<typeof getDeltaSegmentsInput>;
export type GetChannelWindowInput = z.infer<typeof getChannelWindowInput>;

/**
 * Monta as ferramentas do AI SDK ligadas a um repositório de análise.
 *
 * TODO(mvp): implementar quando `@telemetry/analysis` sair dos stubs.
 */
export function createAnalystTools(): never {
  throw new NotImplementedError('createAnalystTools ainda não foi implementado');
}
