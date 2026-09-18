import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { buildDesktop } from './composition-root.js';
import { createIpcEventPublisher } from './event-bridge.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { createIngestionService } from './telemetry-ingestion.js';

/**
 * Processo principal: Node, com estado e vida longa.
 *
 * É aqui que moram o watcher da pasta de telemetria, o banco local e — na fase 2
 * — o addon nativo do SDK do iRacing. Foi exatamente isso que decidiu Electron
 * em vez de Tauri (ADR 0012).
 */
const CLOUD_BASE_URL = process.env.TELEMETRY_CLOUD_URL ?? 'https://api.telemetria.local';
const PUBLICATION_FLUSH_INTERVAL_MS = 60_000;

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
  return window;
}

app.whenReady().then(() => {
  const desktop = buildDesktop({
    // Empurra para todas as janelas vivas. Se não houver nenhuma, o evento
    // simplesmente não acontece — quando a janela abrir, ela consulta o estado.
    events: createIpcEventPublisher(
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
    cloudBaseUrl: CLOUD_BASE_URL,
    // `app.getPath('documents')` resolve a pasta real do Windows, inclusive
    // quando ela está redirecionada para o OneDrive — adivinhar o caminho
    // erraria em boa parte das máquinas.
    documentsDirectory: app.getPath('documents'),
    telemetryDirectoryOverride: process.env.TELEMETRY_DIRECTORY,
    // `fetch` da sessão do Chromium: é ele que guarda e reenvia o cookie selado
    // do login, então o adapter HTTP nunca toca em `Set-Cookie`.
    fetch: (input, init) => session.defaultSession.fetch(input, init),
    env: process.env,
  });

  registerIpcHandlers(desktop, (channel, handler) => {
    ipcMain.handle(channel, (_event, payload) => handler(payload));
  });

  // A esteira: arquivo novo na pasta do sim vira sessão sozinho, com o
  // aplicativo aberto. É o circuito que o piloto espera ao sair do carro.
  const ingestion = createIngestionService({
    watcher: desktop.watcher,
    ingestTelemetryFile: desktop.useCases.ingestTelemetryFile,
    onProblem: (file, reason) => console.warn(`telemetria ignorada: ${file.locator} — ${reason}`),
  });
  void ingestion.start().catch((error) => console.error('watcher não iniciou', error));

  // Publicação roda em segundo plano e nunca bloqueia o piloto. Falha de rede
  // deixa a sessão na fila para a próxima rodada (ADR 0013).
  const flush = setInterval(() => {
    void desktop.useCases.flushPublicationQueue().catch(() => {
      // já tratado dentro do caso de uso; aqui só evitamos rejeição não capturada
    });
  }, PUBLICATION_FLUSH_INTERVAL_MS);

  app.on('will-quit', () => {
    clearInterval(flush);
    void ingestion.stop().finally(() => desktop.db.close());
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
