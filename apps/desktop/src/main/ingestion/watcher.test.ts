import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFileTelemetryWatcher,
  type DiscoveredTelemetryFile,
  telemetryDirectory,
} from './watcher.js';

/**
 * Este teste toca em disco de verdade — é onde o
 * `chokidar` e o sistema de arquivos se encontram, e fingir isso com fake não
 * provaria nada. A lógica de espera, que é a parte difícil, tem teste próprio
 * sem disco em `file-readiness.test.ts`.
 */
const rapido = { stableChecks: 1, pollIntervalMs: 10, timeoutMs: 3_000 };

const esperarPor = <T>(coletar: () => T | undefined, limiteMs = 3_000): Promise<T> =>
  new Promise((resolve, reject) => {
    const inicio = Date.now();
    const tentar = (): void => {
      const valor = coletar();
      if (valor !== undefined) {
        resolve(valor);
      } else if (Date.now() - inicio > limiteMs) {
        reject(new Error('o watcher não anunciou nada a tempo'));
      } else {
        setTimeout(tentar, 20);
      }
    };
    tentar();
  });

describe('createFileTelemetryWatcher', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'telemetry-watcher-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('anuncia o arquivo que já estava na pasta quando o aplicativo abriu', async () => {
    // O piloto espera achar as sessões de ontem na tela, não só as de agora.
    await writeFile(join(directory, 'sessao-de-ontem.ibt'), Buffer.alloc(2048, 1));

    const prontos: DiscoveredTelemetryFile[] = [];
    const watcher = createFileTelemetryWatcher({ directory, readiness: rapido });
    watcher.onFileReady((file) => prontos.push(file));

    await watcher.start();
    const primeiro = await esperarPor(() => prontos[0]);
    await watcher.stop();

    expect(primeiro.locator).toContain('sessao-de-ontem.ibt');
    expect(primeiro.sizeBytes).toBe(2048);
  });

  it('anuncia arquivo que aparece com o aplicativo aberto', async () => {
    const prontos: DiscoveredTelemetryFile[] = [];
    const watcher = createFileTelemetryWatcher({ directory, readiness: rapido });
    watcher.onFileReady((file) => prontos.push(file));

    await watcher.start();
    await writeFile(join(directory, 'sessao-nova.ibt'), Buffer.alloc(4096, 2));

    const primeiro = await esperarPor(() => prontos[0]);
    await watcher.stop();

    expect(primeiro.locator).toContain('sessao-nova.ibt');
  });

  it('não perde o arquivo criado enquanto a pasta ainda está sendo varrida', async () => {
    // O sim cria o `.ibt` no instante em que o piloto abre o app. Sem a leitura
    // da pasta depois da varredura, o chokidar não anunciava este arquivo nunca.
    const prontos: DiscoveredTelemetryFile[] = [];
    const watcher = createFileTelemetryWatcher({ directory, readiness: rapido });
    watcher.onFileReady((file) => prontos.push(file));

    const iniciando = watcher.start();
    await writeFile(join(directory, 'anotacoes.txt'), 'nada a ver');
    await writeFile(join(directory, 'no-meio-da-varredura.ibt'), Buffer.alloc(1024, 4));
    await iniciando;

    const primeiro = await esperarPor(() => prontos[0]);
    await watcher.stop();

    expect(primeiro.locator).toContain('no-meio-da-varredura.ibt');
  });

  it('ignora o que não é telemetria', async () => {
    const prontos: DiscoveredTelemetryFile[] = [];
    const watcher = createFileTelemetryWatcher({ directory, readiness: rapido });
    watcher.onFileReady((file) => prontos.push(file));

    await watcher.start();
    await writeFile(join(directory, 'anotacoes.txt'), 'nada a ver');
    await writeFile(join(directory, 'de-verdade.ibt'), Buffer.alloc(1024, 3));

    const primeiro = await esperarPor(() => prontos[0]);
    await watcher.stop();

    // O `.txt` não pode ter entrado na frente nem atrás.
    expect(prontos).toHaveLength(1);
    expect(primeiro.locator).toContain('de-verdade.ibt');
  });
});

describe('telemetryDirectory', () => {
  it('monta o caminho a partir da pasta Documentos', () => {
    expect(telemetryDirectory('C:\\Users\\piloto\\Documents')).toContain('iRacing');
    expect(telemetryDirectory('C:\\Users\\piloto\\Documents')).toContain('telemetry');
  });
});
