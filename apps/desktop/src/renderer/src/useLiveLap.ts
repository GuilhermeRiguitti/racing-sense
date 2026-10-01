import { useEffect, useState } from 'react';
import { appendLiveSample, createLiveLap, type LapTrace } from '../../main/domain/live-lap.js';
import type { LiveCatalogDto, SeriesDto } from '../../shared/dto.js';
import { bridge } from './bridge.js';

/**
 * Quanto esperar entre uma resposta e o próximo pedido de ticks.
 *
 * O sim guarda os últimos 3 ticks, e só 2 se leem com segurança — o terceiro é o
 * que ele está escrevendo (`freshFrames`): ~33 ms de folga a 60 Hz. Perguntando
 * a cada ~16 ms, nenhum se perde e o traço tem todos os pontos da volta.
 */
const POLL_INTERVAL_MS = 16;
/** Sem sessão no sim, não há tick a perder: pergunta devagar. */
const IDLE_INTERVAL_MS = 1000;
/** Ritmo do desenho: dez quadros por segundo bastam para ver a linha crescer. */
const DRAW_INTERVAL_MS = 100;

export type LiveLapView =
  | { readonly state: 'loading' | 'sim-closed' | 'disconnected' }
  | { readonly state: 'failed'; readonly message: string }
  | {
      readonly state: 'connected';
      readonly catalog: LiveCatalogDto;
      readonly lap: number | null;
      /** A volta em curso, uma série por canal pedido que o carro tem. */
      readonly current: readonly SeriesDto[];
      /** A volta anterior inteira, quando há uma. */
      readonly previous: readonly SeriesDto[] | null;
    };

/**
 * A volta em curso se desenhando, e a anterior, enquanto a tela está aberta.
 * Nada é gravado (ADR 0023): fechar a tela descarta o traço.
 */
export function useLiveLap(channels: readonly string[]): LiveLapView {
  const [view, setView] = useState<LiveLapView>({ state: 'loading' });
  const key = channels.join('|');

  useEffect(() => {
    const names = key === '' ? [] : key.split('|');
    const pedidos = ['Lap', 'LapDistPct', ...names];
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let catalog: LiveCatalogDto | null = null;
    let sinceTick: number | null = null;
    let lap = createLiveLap();
    let dirty = false;
    let lastDraw = 0;

    const toSeries = (trace: LapTrace | null): SeriesDto[] | null => {
      if (trace === null || catalog === null) return null;
      const known = catalog;
      return names.flatMap((name, index) => {
        const channel = known.channels.find((c) => c.name === name);
        const y = trace.y[index];
        if (channel === undefined || y === undefined) return [];
        // Ponto sem valor não vira zero: a série fica só com os pontos que o sim deu.
        const x: number[] = [];
        const values: number[] = [];
        y.forEach((value, i) => {
          if (value !== null) {
            x.push(trace.x[i] as number);
            values.push(value);
          }
        });
        return [{ channel: name, unit: channel.unit, type: channel.type, axis: 'lapDistPct', x, y: values }];
      });
    };

    const draw = () => {
      if (catalog === null) return;
      lastDraw = Date.now();
      dirty = false;
      setView({
        state: 'connected',
        catalog,
        lap: lap.current?.lap ?? null,
        current: toSeries(lap.current) ?? [],
        previous: toSeries(lap.previous),
      });
    };

    const poll = async () => {
      try {
        const result = await bridge().getLiveTicks({
          knownCatalogId: catalog?.catalogId ?? null,
          sinceTick,
          channels: pedidos,
        });
        if (!active) return;
        if (result.failed === true) {
          setView({ state: 'failed', message: result.message });
        } else if (result.value.state !== 'connected') {
          catalog = null;
          sinceTick = null;
          lap = createLiveLap();
          const state = result.value.state;
          setView((before) => (before.state === state ? before : { state }));
        } else {
          const snapshot = result.value;
          if (snapshot.catalog !== null) {
            // Catálogo novo é outra sessão ou outro carro: o traço recomeça.
            catalog = snapshot.catalog;
            lap = createLiveLap();
            dirty = true;
          }
          for (const tick of snapshot.ticks) {
            const [lapNumber, distPct, ...values] = tick.values;
            sinceTick = tick.tickCount;
            if (lapNumber === null || lapNumber === undefined || distPct === null || distPct === undefined) {
              continue;
            }
            if (
              appendLiveSample(lap, {
                tickCount: tick.tickCount,
                lap: lapNumber,
                lapDistPct: distPct,
                values,
              })
            ) {
              dirty = true;
            }
          }
          if (dirty && Date.now() - lastDraw >= DRAW_INTERVAL_MS) draw();
        }
      } catch (error) {
        if (active) setView({ state: 'failed', message: String(error) });
      }
      if (active) {
        timer = setTimeout(() => void poll(), catalog === null ? IDLE_INTERVAL_MS : POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key]);

  return view;
}
