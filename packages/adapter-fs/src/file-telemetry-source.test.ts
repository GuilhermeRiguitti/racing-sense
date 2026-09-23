import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describeTelemetryFileContract } from '@telemetry/application-desktop/testing';
import { afterAll } from 'vitest';
import { createFileTelemetrySource } from './file-telemetry-source.js';

// Pasta temporária dentro do diretório de trabalho, e não a do sistema: pedir a
// do sistema exigiria `node:os`, que este adapter não tem — e alargar a fronteira
// de arquitetura por causa de teste não se justifica.
const pastas: string[] = [];

afterAll(async () => {
  await Promise.all(pastas.map((pasta) => rm(pasta, { recursive: true, force: true })));
});

describeTelemetryFileContract('FileTelemetrySource', async (bytes) => {
  const pasta = await mkdtemp(join(process.cwd(), '.tmp-telemetria-'));
  pastas.push(pasta);
  const locator = join(pasta, 'sessao.ibt');
  await writeFile(locator, bytes);
  return { port: createFileTelemetrySource(), locator };
});
