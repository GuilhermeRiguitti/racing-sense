import { BrowserWindow, type IpcMainEvent, ipcMain, type Rectangle, screen } from 'electron';
import { IPC } from '../../shared/ipc.js';
import { type OverlaySettings, WIDGET_IDS, type WidgetId } from '../../shared/overlay.js';
import type { OverlaySettingsStore } from './overlay-settings.js';

/**
 * As janelas do overlay por cima do sim (ADR 0025): uma por widget.
 *
 * Travadas, elas não pegam foco nem mouse — o clique atravessa para o sim e o
 * volante nunca perde a entrada para o app. Destravadas (`editing`), aceitam
 * arrastar, e soltar grava a posição.
 *
 * Nada aqui desenha dentro do sim nem fala com ele: são janelas comuns do
 * Windows, transparentes e sempre por cima (ADR 0022).
 */
export interface OverlayWindowsOptions {
  readonly settings: OverlaySettingsStore;
  readonly preload: string;
  /** Carrega a tela do renderer com a query dada. Quem sabe o endereço é o `index.ts`. */
  readonly load: (window: BrowserWindow, query: Readonly<Record<string, string>>) => void;
}

export interface OverlayWindows {
  close(): void;
}

interface Entry {
  readonly id: WidgetId;
  readonly window: BrowserWindow;
  /** Último tamanho que a tela pediu, em pixels CSS, antes da escala. */
  content: { width: number; height: number } | null;
}

export function createOverlayWindows(options: OverlayWindowsOptions): OverlayWindows {
  const { settings } = options;
  const entries = new Map<WidgetId, Entry>();

  const fit = (entry: Entry, scale: number) => {
    if (entry.content === null || entry.window.isDestroyed()) return;
    const width = Math.max(1, Math.ceil(entry.content.width * scale));
    const height = Math.max(1, Math.ceil(entry.content.height * scale));
    const [currentWidth, currentHeight] = entry.window.getContentSize();
    if (currentWidth !== width || currentHeight !== height) entry.window.setContentSize(width, height);
  };

  const create = (id: WidgetId, current: OverlaySettings): Entry => {
    const { x, y } = positionOf(id, current);
    const window = new BrowserWindow({
      x,
      y,
      width: 240,
      height: 80,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // Sem foco: um clique perdido no overlay não tira o comando do sim.
      focusable: false,
      alwaysOnTop: true,
      title: `Overlay · ${id}`,
      webPreferences: {
        preload: options.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // A janela nunca tem foco; sem isto o Chromium poderia espaçar os
        // timers que perguntam o quadro.
        backgroundThrottling: false,
      },
    });
    // Acima de janela sem borda em tela cheia, que é como o sim roda quando o
    // piloto quer overlay. Tela cheia exclusiva cobre tudo (ADR 0025).
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setIgnoreMouseEvents(!current.editing);
    window.once('ready-to-show', () => window.showInactive());
    window.webContents.on('did-finish-load', () => {
      window.webContents.setZoomFactor(settings.get().widgets[id].scale);
    });
    window.on('moved', () => {
      if (window.isDestroyed()) return;
      const [movedX, movedY] = window.getPosition();
      settings.update({ widgets: { [id]: { x: movedX, y: movedY } } });
    });
    options.load(window, { overlay: id });
    return { id, window, content: null };
  };

  const apply = (current: OverlaySettings) => {
    for (const id of WIDGET_IDS) {
      const wanted = current.visible && current.widgets[id].enabled;
      const entry = entries.get(id);
      if (!wanted) {
        if (entry !== undefined) {
          entries.delete(id);
          if (!entry.window.isDestroyed()) entry.window.destroy();
        }
        continue;
      }
      if (entry === undefined || entry.window.isDestroyed()) {
        entries.set(id, create(id, current));
        continue;
      }

      const { window } = entry;
      window.setIgnoreMouseEvents(!current.editing);
      window.setFocusable(current.editing);
      const scale = current.widgets[id].scale;
      if (window.webContents.getZoomFactor() !== scale) window.webContents.setZoomFactor(scale);
      fit(entry, scale);
      const target = positionOf(id, current);
      const [x, y] = window.getPosition();
      if (x !== target.x || y !== target.y) window.setPosition(target.x, target.y);
    }
  };

  const onFit = (event: IpcMainEvent, payload: unknown) => {
    const entry = [...entries.values()].find(
      (candidate) => !candidate.window.isDestroyed() && candidate.window.webContents === event.sender,
    );
    // Só janela de overlay se redimensiona por aqui; a janela principal não.
    if (entry === undefined) return;
    const { width, height } = (payload ?? {}) as { width?: unknown; height?: unknown };
    if (typeof width !== 'number' || typeof height !== 'number') return;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    entry.content = { width, height };
    fit(entry, settings.get().widgets[entry.id].scale);
  };

  ipcMain.on(IPC.overlayFit, onFit);
  const unsubscribe = settings.subscribe(apply);
  apply(settings.get());

  return {
    close() {
      unsubscribe();
      ipcMain.removeListener(IPC.overlayFit, onFit);
      for (const { window } of entries.values()) {
        if (!window.isDestroyed()) window.destroy();
      }
      entries.clear();
    },
  };
}

/**
 * Onde a janela fica: a posição gravada, se ela ainda cai numa tela (o monitor
 * pode ter saído), ou a posição padrão na tela principal.
 */
function positionOf(id: WidgetId, current: OverlaySettings): { x: number; y: number } {
  const { x, y } = current.widgets[id];
  if (x !== null && y !== null && onSomeDisplay(x, y)) return { x, y };
  return defaultPosition(id, screen.getPrimaryDisplay().workArea);
}

function onSomeDisplay(x: number, y: number): boolean {
  return screen
    .getAllDisplays()
    .some(({ workArea: a }) => x >= a.x && y >= a.y && x < a.x + a.width && y < a.y + a.height);
}

/**
 * O arranjo da primeira vez, parecido com o dos overlays conhecidos: delta e
 * bandeira no alto ao centro, pedais embaixo ao centro, classificação à
 * esquerda, relative à direita. Escolha de apresentação — o piloto arrasta.
 */
function defaultPosition(id: WidgetId, area: Rectangle): { x: number; y: number } {
  const at = (fx: number, fy: number, dx = 0, dy = 0) => ({
    x: Math.round(area.x + area.width * fx + dx),
    y: Math.round(area.y + area.height * fy + dy),
  });
  switch (id) {
    case 'delta':
      return at(0.5, 0, -170, 24);
    case 'flag':
      return at(0.5, 0, -90, 110);
    case 'inputs':
      return at(0.5, 1, -190, -190);
    case 'standings':
      return at(0, 0.12, 16);
    case 'relative':
      return at(1, 0.55, -440);
    case 'fuel':
      return at(1, 0.2, -280);
    case 'radar':
      return at(0.5, 0.45, -70);
  }
}
