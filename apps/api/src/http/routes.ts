import {
  importReferenceLapRequest,
  ingestTelemetryFileRequest,
  requestLapAnalysisRequest,
  toAnalysisReportDto,
  toLapDto,
  toSessionDto,
} from '@telemetry/contracts';
import { toReferenceLapId, toSessionId } from '@telemetry/domain';
import { Hono } from 'hono';
import type { UseCases } from '../composition-root.js';
import { toErrorResponse } from './error-handler.js';

/**
 * Controllers.
 *
 * Cada rota faz três coisas e só: valida a entrada com o schema de
 * `@telemetry/contracts`, chama **um** caso de uso, converte a saída em DTO.
 * Regra de negócio dentro de rota é erro de camada — o `pnpm arch` não pega
 * isso, revisão pega.
 */
export function createRoutes(useCases: UseCases): Hono {
  const app = new Hono();

  app.onError(toErrorResponse);

  app.get('/health', (c) => c.json({ status: 'ok', service: 'telemetry-api' }));

  // --- comandos ---

  app.post('/sessions', async (c) => {
    const body = ingestTelemetryFileRequest.parse(await c.req.json());
    const sessionId = await useCases.ingestTelemetryFile({ locator: body.locator });
    return c.json({ sessionId }, 201);
  });

  app.post('/reference-laps', async (c) => {
    const body = importReferenceLapRequest.parse(await c.req.json());
    const referenceLapId = await useCases.importReferenceLap({
      sessionId: toSessionId(body.sessionId),
      lapNumber: body.lapNumber,
      label: body.label,
    });
    return c.json({ referenceLapId }, 201);
  });

  app.post('/sessions/:sessionId/laps/:lapNumber/analysis', async (c) => {
    const body = requestLapAnalysisRequest.parse(await c.req.json());
    await useCases.requestLapAnalysis({
      sessionId: toSessionId(c.req.param('sessionId')),
      lapNumber: Number(c.req.param('lapNumber')),
      referenceLapId: toReferenceLapId(body.referenceLapId),
    });
    // Comando não devolve dado de leitura: quem quer o relatório faz o GET.
    return c.body(null, 202);
  });

  // --- queries ---

  app.get('/sessions', async (c) => {
    const sessions = await useCases.listSessions();
    return c.json(sessions.map(toSessionDto));
  });

  app.get('/sessions/:sessionId/laps', async (c) => {
    const laps = await useCases.listSessionLaps({
      sessionId: toSessionId(c.req.param('sessionId')),
    });
    return c.json(laps.map(toLapDto));
  });

  app.get('/reference-laps', async (c) => {
    const references = await useCases.listReferenceLaps();
    return c.json(
      references.map((reference) => ({
        id: reference.id,
        label: reference.label,
        origin: reference.origin,
        trackName: reference.track.name,
        carName: reference.car.name,
        lapNumber: reference.lap.number,
        lapTimeSeconds: reference.lap.lapTimeSeconds,
      })),
    );
  });

  app.get('/sessions/:sessionId/laps/:lapNumber/analysis', async (c) => {
    const report = await useCases.getLapAnalysis({
      sessionId: toSessionId(c.req.param('sessionId')),
      lapNumber: Number(c.req.param('lapNumber')),
      referenceLapId: toReferenceLapId(c.req.query('referenceLapId') ?? ''),
    });
    return c.json(toAnalysisReportDto(report));
  });

  return app;
}
