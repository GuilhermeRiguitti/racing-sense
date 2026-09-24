import { join } from 'node:path';
import type { DesktopEvent } from '../shared/ipc.js';
import { type Narrate, narratorFromEnv } from './analysis/narrator.js';
import { type ApiClient, createApiClient, type FetchLike } from './cloud/api-client.js';
import { type LocalStore, openLocalStore } from './db/local-store.js';
import {
  createFileTelemetryWatcher,
  type TelemetryWatcher,
  telemetryDirectory,
} from './ingestion/watcher.js';

/**
 * O que o processo principal monta ao abrir o app.
 *
 * Tudo que o coach faz — ingerir, comparar, narrar — roda com o banco local e o
 * modelo, sem esperar a api. A api só é chamada para login e para publicar, em
 * segundo plano (regra 10).
 */
export interface Desktop {
  readonly store: LocalStore;
  readonly watcher: TelemetryWatcher;
  readonly api: ApiClient;
  readonly narrate: Narrate;
  readonly emit: (event: DesktopEvent) => void;
}

export interface DesktopEnvironment {
  /** Pasta de dados do app (`app.getPath('userData')` no Electron). */
  readonly userDataDir: string;
  /** Endereço da api. */
  readonly apiBaseUrl: string;
  /**
   * A pasta Documentos do usuário.
   *
   * Vem de fora porque quem sabe resolvê-la no Windows — inclusive quando está
   * redirecionada para o OneDrive — é o Electron.
   */
  readonly documentsDirectory: string;
  /** Sobrescreve a pasta observada. Útil em desenvolvimento e em teste. */
  readonly telemetryDirectoryOverride?: string | undefined;
  /**
   * `fetch` que carrega o cookie de sessão.
   *
   * No Electron é o `fetch` da sessão do Chromium, que guarda e reenvia o cookie
   * selado do login — o cliente da api nunca toca em `Set-Cookie`.
   */
  readonly fetch: FetchLike;
  readonly env: Record<string, string | undefined>;
  /** Para onde vão os avisos de "mudou alguma coisa". Quem sabe empurrar para a tela é o Electron. */
  readonly emit: (event: DesktopEvent) => void;
}

export function buildDesktop(environment: DesktopEnvironment): Desktop {
  return {
    store: openLocalStore(join(environment.userDataDir, 'telemetry.db')),
    // Observa a pasta do sim. Só diz *quando* um arquivo pode ser lido.
    watcher: createFileTelemetryWatcher({
      directory:
        environment.telemetryDirectoryOverride ??
        telemetryDirectory(environment.documentsDirectory),
    }),
    api: createApiClient({ baseUrl: environment.apiBaseUrl, fetch: environment.fetch }),
    narrate: narratorFromEnv(environment.env),
    emit: environment.emit,
  };
}
