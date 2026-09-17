import { z } from 'zod';

/** Entradas da API. Validar na borda evita id inventado chegando no caso de uso. */
export const importReferenceLapRequest = z.object({
  sessionId: z.string().min(1),
  lapNumber: z.int(),
  label: z.string().min(1).max(120),
});
export type ImportReferenceLapRequest = z.infer<typeof importReferenceLapRequest>;

export const ingestTelemetryFileRequest = z.object({
  locator: z.string().min(1),
});
export type IngestTelemetryFileRequest = z.infer<typeof ingestTelemetryFileRequest>;

export const requestLapAnalysisRequest = z.object({
  referenceLapId: z.string().min(1),
});
export type RequestLapAnalysisRequest = z.infer<typeof requestLapAnalysisRequest>;
