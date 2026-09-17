import { Hono } from 'hono';

/**
 * API local do analisador.
 *
 * Roda na máquina do piloto, junto com o watcher — é ela que enxerga a pasta de
 * telemetria. O front consome esta API. Nada aqui assume internet.
 *
 * Rotas ainda não implementadas respondem 501 explicitamente, com o caminho da
 * implementação no corpo. Rota fantasma que responde 404 esconde trabalho pendente.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'telemetry-api' }));

  app.get('/sessions', (c) =>
    c.json({ error: 'não implementado', owner: '@telemetry/ingest' }, 501),
  );

  app.get('/sessions/:sessionId/laps', (c) =>
    c.json({ error: 'não implementado', owner: '@telemetry/analysis' }, 501),
  );

  app.post('/reference-laps', (c) =>
    c.json(
      {
        error: 'não implementado',
        owner: '@telemetry/ingest + @telemetry/analysis',
        detail: 'importa um .ibt e promove uma volta dele a referência de comparação',
      },
      501,
    ),
  );

  app.post('/sessions/:sessionId/laps/:lapNumber/analysis', (c) =>
    c.json({ error: 'não implementado', owner: '@telemetry/agent' }, 501),
  );

  return app;
}
