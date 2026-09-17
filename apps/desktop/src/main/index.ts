import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { buildDesktop } from './composition-root.js';
import { registerIpcHandlers } from './ipc-handlers.js';

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
    userDataDir: app.getPath('userData'),
    cloudBaseUrl: CLOUD_BASE_URL,
    // `fetch` da sessão do Chromium: é ele que guarda e reenvia o cookie selado
    // do login, então o adapter HTTP nunca toca em `Set-Cookie`.
    fetch: (input, init) => session.defaultSession.fetch(input, init),
    env: process.env,
  });

  registerIpcHandlers(desktop, (channel, handler) => {
    ipcMain.handle(channel, (_event, payload) => handler(payload));
  });

  // Publicação roda em segundo plano e nunca bloqueia o piloto. Falha de rede
  // deixa a sessão na fila para a próxima rodada (ADR 0013).
  const flush = setInterval(() => {
    void desktop.useCases.flushPublicationQueue().catch(() => {
      // já tratado dentro do caso de uso; aqui só evitamos rejeição não capturada
    });
  }, PUBLICATION_FLUSH_INTERVAL_MS);

  app.on('will-quit', () => {
    clearInterval(flush);
    desktop.db.close();
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
