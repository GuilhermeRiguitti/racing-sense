import { open, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { DiscoveredTelemetryFile, TelemetryWatcherPort } from '@telemetry/application-desktop';
import { type FSWatcher, watch } from 'chokidar';
import {
  DEFAULT_READINESS,
  type ReadinessOptions,
  type ReadinessProbe,
  waitUntilReadable,
} from './file-readiness.js';

/**
 * Onde o iRacing grava a telemetria, a partir da pasta Documentos.
 *
 * Recebe a pasta em vez de descobrir sozinho porque quem sabe resolvê-la é o
 * Electron (`app.getPath('documents')`) — e no Windows ela pode estar
 * redirecionada para o OneDrive, caso em que adivinhar o caminho erraria.
 */
export function telemetryDirectory(documentsDirectory: string): string {
  return join(documentsDirectory, 'iRacing', 'telemetry');
}

export const TELEMETRY_FILE_EXTENSION = '.ibt';

export interface FileWatcherOptions {
  /** Pasta observada. Use `telemetryDirectory(...)` para montá-la. */
  readonly directory: string;
  readonly readiness?: Partial<ReadinessOptions>;
}

const nodeProbe: ReadinessProbe = {
  size: async (path) => (await stat(path)).size,
  openForRead: async (path) => {
    const handle = await open(path, 'r');
    await handle.close();
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

/**
 * Observa a pasta de telemetria do iRacing.
 *
 * O que ele faz, em ordem:
 *
 * 1. vê um `.ibt` aparecer — inclusive os que já estavam lá quando o aplicativo
 *    abriu, porque o piloto espera encontrar as sessões de ontem na tela. Não
 *    reprocessar é responsabilidade da ingestão, que é idempotente por arquivo;
 * 2. espera o arquivo parar de crescer e destravar (ver `file-readiness.ts`);
 * 3. anuncia pronto — ou recusado, com o motivo, nunca em silêncio.
 *
 * O que ele **não** faz: abrir, decodificar ou interpretar coisa alguma. Isso é
 * do decoder. Aqui é só sobre *quando* o arquivo pode ser lido.
 */
export function createFileTelemetryWatcher(options: FileWatcherOptions): TelemetryWatcherPort {
  const readiness = { ...DEFAULT_READINESS, ...options.readiness };
  const readyListeners: ((file: DiscoveredTelemetryFile) => void)[] = [];
  const rejectedListeners: ((file: DiscoveredTelemetryFile, reason: string) => void)[] = [];

  /** Arquivos em espera agora. Evita duas esperas para o mesmo caminho. */
  const inFlight = new Set<string>();
  let watcher: FSWatcher | null = null;

  const handleCandidate = async (path: string): Promise<void> => {
    if (extname(path).toLowerCase() !== TELEMETRY_FILE_EXTENSION || inFlight.has(path)) {
      return;
    }
    inFlight.add(path);

    const discoveredAt = new Date();
    try {
      const result = await waitUntilReadable(path, nodeProbe, readiness);
      const file: DiscoveredTelemetryFile = {
        locator: path,
        sizeBytes: result.ready ? result.sizeBytes : 0,
        discoveredAt,
      };

      for (const listener of result.ready ? readyListeners : []) {
        listener(file);
      }
      if (!result.ready) {
        for (const listener of rejectedListeners) {
          listener(file, result.reason);
        }
      }
    } finally {
      inFlight.delete(path);
    }
  };

  return {
    async start() {
      if (watcher !== null) {
        return;
      }
      watcher = watch(options.directory, {
        // Só a pasta de telemetria, sem descer em subpastas.
        depth: 0,
        // Os arquivos que já estão lá também interessam: é o histórico do piloto.
        ignoreInitial: false,
      });
      watcher.on('add', (path) => {
        void handleCandidate(path);
      });
    },

    async stop() {
      const current = watcher;
      watcher = null;
      await current?.close();
    },

    onFileReady(listener) {
      readyListeners.push(listener);
    },

    onFileRejected(listener) {
      rejectedListeners.push(listener);
    },
  };
}
