import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS } from '../../shared/overlay.js';
import { createOverlaySettingsStore, sanitize } from './overlay-settings.js';

const dirs: string[] = [];
function aPath() {
  const dir = mkdtempSync(join(tmpdir(), 'overlay-settings-'));
  dirs.push(dir);
  return join(dir, 'overlay.json');
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('configuração do overlay', () => {
  it('sem arquivo, o padrão', () => {
    expect(createOverlaySettingsStore(aPath()).get()).toEqual(DEFAULT_OVERLAY_SETTINGS);
  });

  it('JSON quebrado não impede o app de abrir', () => {
    const path = aPath();
    writeFileSync(path, '{ quebrado');

    expect(createOverlaySettingsStore(path).get()).toEqual(DEFAULT_OVERLAY_SETTINGS);
  });

  it('grava, relê e avisa quem assina', () => {
    const path = aPath();
    const store = createOverlaySettingsStore(path);
    const listener = vi.fn();
    store.subscribe(listener);

    store.update({ widgets: { fuel: { enabled: true, x: 100, y: 200 } }, relative: { carsAhead: 4 } });
    const reopened = createOverlaySettingsStore(path).get();

    expect(reopened.widgets.fuel).toEqual({ enabled: true, x: 100, y: 200, scale: 1 });
    expect(reopened.widgets.relative).toEqual(DEFAULT_OVERLAY_SETTINGS.widgets.relative);
    expect(reopened.relative.carsAhead).toBe(4);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ relative: expect.anything() }));
  });

  it('destravado não é gravado: o app sempre abre travado', () => {
    const path = aPath();
    createOverlaySettingsStore(path).update({ editing: true });

    expect(JSON.parse(readFileSync(path, 'utf8'))).not.toHaveProperty('editing');
    expect(createOverlaySettingsStore(path).get().editing).toBe(false);
  });

  it('valor fora da faixa ou de outro tipo cai no limite ou no padrão', () => {
    const settings = sanitize({
      backgroundOpacity: 7,
      widgets: { relative: { scale: 0, x: 'longe' } },
      relative: { carsAhead: 2.6, columns: { iRating: 'sim' } },
      delta: { reference: 'inventada' },
    });

    expect(settings.backgroundOpacity).toBe(1);
    expect(settings.widgets.relative.scale).toBe(0.5);
    expect(settings.widgets.relative.x).toBeNull();
    expect(settings.relative.carsAhead).toBe(3);
    expect(settings.relative.columns.iRating).toBe(true);
    expect(settings.delta.reference).toBe('session-best');
  });
});
