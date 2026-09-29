import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { flushPublicationQueue } from './cloud/publication.js';
import { buildDesktop } from './desktop.js';
import { ingestTelemetryFile } from './ingestion/ingest-file.js';
import { createIngestionService } from './ingestion/ingestion-service.js';
import { createEventEmitter } from './ipc/events.js';
import { registerIpcHandlers } from './ipc/handlers.js';

/**
 * Processo principal: Node, com estado e vida longa.
 *
 * É aqui que moram o watcher da pasta de telemetria, o banco local e a leitura
 * da memória compartilhada do iRacing (ADR 0023). Foi exatamente isso que
 * decidiu Electron em vez de Tauri (ADR 0012).
 */
loadDevelopmentEnv();

const API_BASE_URL = process.env.TELEMETRY_API_URL ?? 'http://localhost:4000';
const PUBLICATION_FLUSH_INTERVAL_MS = 60_000;

/**
 * Em desenvolvimento, lê `apps/desktop/.env` (não versionado) para o ambiente
 * do processo principal: chave do provedor de LLM, pasta observada, endereço da
 * api. Variável já definida no terminal vence o arquivo.
 *
 * No aplicativo empacotado não há `.env`: o ambiente é o da máquina do piloto.
 * Arquivo ausente não é erro — o app abre igual, com os padrões.
 */
function loadDevelopmentEnv(): void {
  if (app.isPackaged) {
    return;
  }
  try {
    process.loadEnvFile(join(app.getAppPath(), '.env'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // As três linhas que mantêm o renderer sendo só um navegador.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());

  // Sem página carregada, `ready-to-show` nunca dispara e a janela, criada com
  // `show: false`, fica invisível para sempre. Em desenvolvimento o
  // electron-vite serve o renderer e passa o endereço por variável de ambiente;
  // no build, a página está ao lado do processo principal.
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl !== undefined) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
  return window;
}

app.whenReady().then(() => {
  const desktop = buildDesktop({
    // Empurra para todas as janelas vivas. Se não houver nenhuma, o evento
    // simplesmente não acontece — quando a janela abrir, ela consulta o estado.
    emit: createEventEmitter(
      (channel, payload) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send(channel, payload);
          }
        }
      },
      (error) => console.error('falha ao anunciar evento', error),
    ),
    userDataDir: app.getPath('userData'),
    apiBaseUrl: API_BASE_URL,
    // `app.getPath('documents')` resolve a pasta real do Windows, inclusive
    // quando ela está redirecionada para o OneDrive — adivinhar o caminho
    // erraria em boa parte das máquinas.
    documentsDirectory: app.getPath('documents'),
    telemetryDirectoryOverride: process.env.TELEMETRY_DIRECTORY,
    // `fetch` da sessão do Chromium: é ele que guarda e reenvia o cookie selado
    // do login, então o cliente da api nunca toca em `Set-Cookie`.
    fetch: (request) => session.defaultSession.fetch(request),
    env: process.env,
  });

  registerIpcHandlers(desktop, (channel, handler) => {
    ipcMain.handle(channel, (_event, payload) => handler(payload));
  });

  // A esteira: arquivo novo na pasta do sim vira sessão sozinho, com o
  // aplicativo aberto. É o circuito que o piloto espera ao sair do carro.
  const ingestion = createIngestionService({
    watcher: desktop.watcher,
    ingest: (path) => ingestTelemetryFile(desktop, path),
    onProblem: (file, reason) => console.warn(`telemetria ignorada: ${file.locator} — ${reason}`),
  });
  void ingestion.start().catch((error) => console.error('watcher não iniciou', error));

  // Publicação roda em segundo plano e nunca bloqueia o piloto. Falha de rede
  // deixa a sessão na fila para a próxima rodada (ADR 0013).
  const flush = setInterval(() => {
    void flushPublicationQueue(desktop).catch(() => {
      // já tratado dentro da função; aqui só evitamos rejeição não capturada
    });
  }, PUBLICATION_FLUSH_INTERVAL_MS);

  app.on('will-quit', () => {
    clearInterval(flush);
    desktop.live.close();
    void ingestion.stop().finally(() => desktop.store.close());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
