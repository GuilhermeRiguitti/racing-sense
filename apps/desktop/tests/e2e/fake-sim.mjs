/**
 * Sobe o sim falso (`tests/support/fake-sim.ts`) até ser interrompido.
 *
 * Para olhar o overlay e a tela ao vivo sem o iRacing numa sessão:
 *
 *   node tests/e2e/fake-sim.mjs            # num terminal
 *   TELEMETRY_LIVE_MEMORY_NAME=Local\TelemetryFakeSim pnpm dev   # noutro
 *
 * O TypeScript é carregado pelo vite, que já é dependência do app: nada de
 * compilar à parte.
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const { values } = parseArgs({
  options: { name: { type: 'string', default: 'Local\\TelemetryFakeSim' } },
});

const root = fileURLToPath(new URL('../..', import.meta.url));
const vite = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
const { startFakeSim } = await vite.ssrLoadModule('/tests/support/fake-sim.ts');
const sim = startFakeSim(values.name);
console.log(`sim falso escrevendo em ${values.name} — Ctrl+C para parar`);

const stop = async () => {
  sim.stop();
  await vite.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
