import type { Hono } from 'hono';
import { buildUseCases } from './composition-root.js';
import { createRoutes } from './http/routes.js';

/**
 * API local do analisador.
 *
 * Roda na máquina do piloto, junto com o watcher — é ela que enxerga a pasta de
 * telemetria. O front consome esta API. Nada aqui assume internet.
 */
export function createApp(env: Record<string, string | undefined> = process.env): Hono {
  return createRoutes(buildUseCases(env));
}
