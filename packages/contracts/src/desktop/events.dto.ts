import { z } from 'zod';

/**
 * O que o processo principal empurra para a interface do aplicativo.
 *
 * É o contrato de um canal só, discriminado por `type` — um canal por evento
 * viraria uma lista que ninguém mantém sincronizada com o preload.
 *
 * Evento é **aviso**, não dado: ele diz "olha, mudou", e quem recebe responde
 * consultando de novo. Por isso os payloads são mínimos — nenhum deles carrega
 * série, volta ou relatório.
 */
export const desktopEventDto = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session-ingested'),
    sessionId: z.string(),
    lapCount: z.int().nonnegative(),
  }),
  z.object({
    type: z.literal('analysis-ready'),
    sessionId: z.string(),
    lapNumber: z.int(),
    referenceLapId: z.string(),
  }),
  z.object({
    type: z.literal('publication-progressed'),
    published: z.int().nonnegative(),
    failed: z.int().nonnegative(),
  }),
]);

export type DesktopEventDto = z.infer<typeof desktopEventDto>;
export type DesktopEventType = DesktopEventDto['type'];
