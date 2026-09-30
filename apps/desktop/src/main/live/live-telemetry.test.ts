import { describe, expect, it, vi } from 'vitest';
import type { LiveMemoryHandle } from '../ibt/live-memory.js';
import { aLiveRegion, type FakeLiveRegion } from '../../../tests/support/live-region.js';
import { createLiveTelemetry, type LiveSnapshot } from './live-telemetry.js';

const SESSION_INFO = [
  'WeekendInfo:',
  ' TrackName: roadatlanta full',
  ' TrackDisplayName: Michelin Raceway Road Atlanta',
  ' TrackLength: 4.0569 km',
  'DriverInfo:',
  ' DriverCarIdx: 1',
  ' Drivers:',
  ' - CarIdx: 0',
  '   UserName: Outro Piloto',
  '   CarPath: mclaren720sgt3',
  ' - CarIdx: 1',
  '   UserName: André Teste',
  '   CarPath: ferrari296gt3',
  '   CarScreenName: Ferrari 296 GT3',
  '',
].join('\n');

function handleOver(region: FakeLiveRegion): LiveMemoryHandle & { closed: boolean } {
  return {
    byteLength: region.bytes.byteLength,
    closed: false,
    read: region.memory.read,
    close() {
      this.closed = true;
    },
  };
}

function connected(snapshot: LiveSnapshot) {
  if (snapshot.state !== 'connected') throw new Error(`esperado conectado, veio ${snapshot.state}`);
  return snapshot;
}

describe('leitura ao vivo', () => {
  it('sim fechado não é erro: é um estado', () => {
    const live = createLiveTelemetry(() => null);

    expect(live.snapshot()).toEqual({ state: 'sim-closed' });
  });

  it('entrega o catálogo do sim e os valores do frame na ordem dele', () => {
    const region = aLiveRegion();
    region.setSessionInfo(SESSION_INFO, 1);
    region.writeFrame(0, 10, { Speed: 42, Gear: 3, CarIdxLapDistPct: [0.1, 0.5, 0.9] });
    const live = createLiveTelemetry(() => handleOver(region));

    const snapshot = connected(live.snapshot());

    expect(snapshot.tickCount).toBe(10);
    expect(snapshot.catalog?.channels.map((c) => c.name)).toEqual([
      'Speed',
      'Gear',
      'CarIdxLapDistPct',
    ]);
    expect(snapshot.catalog?.channels[1]?.type).toBe('integer');
    expect(snapshot.catalog?.track.id).toBe('roadatlanta full');
    expect(snapshot.catalog?.car.id).toBe('ferrari296gt3');
    expect(snapshot.catalog?.driverName).toBe('André Teste');
    expect(snapshot.catalog?.playerCarIdx).toBe(1);
    expect(snapshot.values[0]).toBe(42);
    expect(snapshot.values[1]).toBe(3);
    expect(snapshot.values[2]).toHaveLength(3);
  });

  it('não reenvia o catálogo que a tela já tem', () => {
    const region = aLiveRegion();
    region.setSessionInfo(SESSION_INFO, 1);
    region.writeFrame(0, 10, {});
    const live = createLiveTelemetry(() => handleOver(region));
    const first = connected(live.snapshot());

    const second = connected(live.snapshot(first.catalogId));

    expect(second.catalog).toBeNull();
    expect(second.catalogId).toBe(first.catalogId);
  });

  it('session info reescrita pelo sim vira catálogo novo', () => {
    const region = aLiveRegion();
    region.setSessionInfo(SESSION_INFO, 1);
    region.writeFrame(0, 10, {});
    const live = createLiveTelemetry(() => handleOver(region));
    const first = connected(live.snapshot());

    region.setSessionInfo(SESSION_INFO.replace('roadatlanta full', 'suzuka grandprix'), 2);
    const second = connected(live.snapshot(first.catalogId));

    expect(second.catalogId).not.toBe(first.catalogId);
    expect(second.catalog?.track.id).toBe('suzuka grandprix');
  });

  it('ticks: todos os novos desde o último, só os canais pedidos', () => {
    const region = aLiveRegion();
    region.setSessionInfo(SESSION_INFO, 1);
    region.writeFrame(0, 10, { Speed: 40, Gear: 3 });
    const live = createLiveTelemetry(() => handleOver(region));

    const first = live.ticks({ knownCatalogId: null, sinceTick: null, channels: ['Speed'] });
    if (first.state !== 'connected') throw new Error(first.state);
    expect(first.catalog).not.toBeNull();
    expect(first.ticks).toEqual([{ tickCount: 10, values: [40] }]);

    region.writeFrame(1, 11, { Speed: 41, Gear: 3 });
    region.writeFrame(2, 12, { Speed: 42, Gear: 4 });
    const next = live.ticks({
      knownCatalogId: first.catalogId,
      sinceTick: 10,
      // Canal por carro e canal que não existe vêm nulos, sem erro.
      channels: ['Gear', 'CarIdxLapDistPct', 'Inexistente'],
    });
    if (next.state !== 'connected') throw new Error(next.state);

    expect(next.catalog).toBeNull();
    expect(next.ticks).toEqual([
      { tickCount: 11, values: [3, null, null] },
      { tickCount: 12, values: [4, null, null] },
    ]);
  });

  it('o catálogo ao vivo traz o grid e os tipos de sessão', () => {
    const region = aLiveRegion();
    region.setSessionInfo(SESSION_INFO, 1);
    region.writeFrame(0, 10, {});
    const live = createLiveTelemetry(() => handleOver(region));

    const snapshot = connected(live.snapshot());

    expect(snapshot.catalog?.drivers.map((d) => d.name)).toEqual(['Outro Piloto', 'André Teste']);
    expect(snapshot.catalog?.drivers[1]?.car.make?.name).toBe('Ferrari');
  });

  it('sim fora de sessão solta a memória e reabre no próximo pedido', () => {
    const region = aLiveRegion();
    region.setSessionInfo(SESSION_INFO, 1);
    region.writeFrame(0, 10, {});
    const handles: ReturnType<typeof handleOver>[] = [];
    const open = vi.fn(() => {
      const handle = handleOver(region);
      handles.push(handle);
      return handle;
    });
    const live = createLiveTelemetry(open);
    const first = connected(live.snapshot());

    region.setStatus(0);
    expect(live.snapshot()).toEqual({ state: 'disconnected' });
    expect(handles[0]?.closed).toBe(true);

    region.setStatus(1);
    const again = connected(live.snapshot(first.catalogId));

    expect(open).toHaveBeenCalledTimes(2);
    // Mesma session info, conexão nova: a tela recebe o catálogo de novo, porque
    // o carro pode ter mudado sem o contador de session info mudar.
    expect(again.catalogId).not.toBe(first.catalogId);
    expect(again.catalog).not.toBeNull();
  });
});
