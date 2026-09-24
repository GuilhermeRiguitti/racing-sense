import { open, readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
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

/** Um `.ibt` que o watcher encontrou — pronto para ler, ou recusado com motivo. */
export interface DiscoveredTelemetryFile {
  readonly locator: string;
  readonly sizeBytes: number;
  readonly discoveredAt: Date;
}

export interface TelemetryWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  onFileReady(listener: (file: DiscoveredTelemetryFile) => void): void;
  /** Arquivo que nunca estabilizou. Não some em silêncio. */
  onFileRejected(listener: (file: DiscoveredTelemetryFile, reason: string) => void): void;
}

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
 * da ingestão. Aqui é só sobre *quando* o arquivo pode ser lido.
 */
export function createFileTelemetryWatcher(options: FileWatcherOptions): TelemetryWatcher {
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
        // Polling, não `fs.watch`. No Windows o `fs.watch` abre cada arquivo, e
        // o que o sim está gravando responde EBUSY: o chokidar desiste dele sem
        // anunciar `add` — justo a sessão que o piloto acabou de rodar. O
        // polling só pergunta o tamanho, e não segura handle no arquivo do sim.
        usePolling: true,
        interval: readiness.pollIntervalMs,
        binaryInterval: readiness.pollIntervalMs,
      });
      const vistosPeloChokidar = new Set<string>();
      watcher.on('add', (path) => {
        vistosPeloChokidar.add(path);
        void handleCandidate(path);
      });
      // Arquivo recusado por tempo (sessão longa, sim segurando a trava) volta a
      // ser candidato quando o sim torna a escrever nele — e a última escrita
      // vem antes de soltar a trava. `inFlight` impede duas esperas simultâneas,
      // e a ingestão é idempotente por arquivo.
      watcher.on('change', (path) => {
        void handleCandidate(path);
      });
      // Sem ouvinte, o `error` do chokidar vira exceção solta no processo.
      watcher.on('error', (error) => {
        const file: DiscoveredTelemetryFile = {
          locator: (error as { path?: string }).path ?? options.directory,
          sizeBytes: 0,
          discoveredAt: new Date(),
        };
        const reason = `falha ao observar a pasta: ${error instanceof Error ? error.message : String(error)}`;
        for (const listener of rejectedListeners) {
          listener(file, reason);
        }
      });

      // Arquivo criado *durante* a varredura inicial escapa do chokidar: ele não
      // entra na leitura da pasta nem vira `add` depois — e a sessão só apareceria
      // na próxima abertura do app. Acontece quando o sim cria o `.ibt` no
      // instante em que o piloto abre o coach. Terminada a varredura, uma leitura
      // da pasta pega o que ficou para trás.
      const current = watcher;
      await new Promise<void>((resolve) => current.once('ready', () => resolve()));
      // Pasta que ainda não existe (iRacing nunca gravou nada) não é erro: o
      // chokidar continua olhando e anuncia quando ela aparecer.
      const nomes = await readdir(options.directory).catch(() => [] as string[]);
      for (const name of nomes) {
        const path = join(options.directory, name);
        if (!vistosPeloChokidar.has(path)) {
          void handleCandidate(path);
        }
      }
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
