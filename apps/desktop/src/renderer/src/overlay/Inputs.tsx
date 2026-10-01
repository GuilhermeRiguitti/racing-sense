import { useEffect, useRef, useState } from 'react';
import type { OverlaySettings } from '../../../shared/overlay.js';
import { bridge } from '../bridge.js';

/**
 * Cada ~16 ms: dos 3 buffers do sim, só 2 se leem com segurança (o terceiro é o
 * que ele está escrevendo, ver `freshFrames`) — ~33 ms de folga a 60 Hz.
 * Perguntando na metade disso, nenhum tick se perde.
 */
const POLL_INTERVAL_MS = 16;
const IDLE_INTERVAL_MS = 1000;
const CHANNELS = ['Throttle', 'Brake', 'Clutch', 'Gear', 'Speed'] as const;
const TRACE_WIDTH = 240;
const TRACE_HEIGHT = 72;

interface Pedals {
  readonly throttle: number | null;
  readonly brake: number | null;
  /** Posição do pedal, de 0 (solto) a 1 (no fundo). */
  readonly clutch: number | null;
  readonly gear: number | null;
  readonly speedMs: number | null;
}

/**
 * Acelerador e freio dos últimos segundos, tick a tick, com as barras do
 * momento, a marcha e a velocidade. As cores são as dos mesmos canais no
 * gráfico da volta: acelerador azul, freio laranja.
 *
 * O `Clutch` do sim é o quanto a embreagem está **acoplada** (1 = pedal solto);
 * a barra mostra o pedal, então é o complemento.
 */
export function Inputs({ settings, editing }: { settings: OverlaySettings; editing: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState<Pedals | null>(null);
  const seconds = settings.inputs.seconds;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let catalogId: string | null = null;
    let sinceTick: number | null = null;
    let tickRate = 60;
    const throttle: number[] = [];
    const brake: number[] = [];

    const draw = () => {
      const context = canvas.current?.getContext('2d');
      if (context === null || context === undefined) return;
      const style = getComputedStyle(document.documentElement);
      const capacity = seconds * tickRate;
      const step = TRACE_WIDTH / Math.max(1, capacity - 1);
      context.clearRect(0, 0, TRACE_WIDTH, TRACE_HEIGHT);
      context.lineWidth = 2;
      context.lineJoin = 'round';
      for (const [serie, color] of [
        [throttle, style.getPropertyValue('--ov-throttle')],
        [brake, style.getPropertyValue('--ov-brake')],
      ] as const) {
        context.strokeStyle = color;
        context.beginPath();
        const offset = capacity - serie.length;
        serie.forEach((value, index) => {
          const x = (offset + index) * step;
          const y = 1 + (1 - value) * (TRACE_HEIGHT - 2);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
      }
    };

    const poll = async () => {
      let connected = false;
      try {
        const result = await bridge().getLiveTicks({ knownCatalogId: catalogId, sinceTick, channels: CHANNELS });
        if (!active) return;
        if (result.failed !== true && result.value.state === 'connected') {
          connected = true;
          const value = result.value;
          if (value.catalog !== null) {
            catalogId = value.catalog.catalogId;
            tickRate = value.catalog.tickRate;
            throttle.length = 0;
            brake.length = 0;
          }
          const capacity = seconds * tickRate;
          let last: (number | null)[] | null = null;
          for (const tick of value.ticks) {
            sinceTick = tick.tickCount;
            const [t, b] = tick.values;
            throttle.push(t ?? 0);
            brake.push(b ?? 0);
            last = [...tick.values];
          }
          throttle.splice(0, Math.max(0, throttle.length - capacity));
          brake.splice(0, Math.max(0, brake.length - capacity));
          if (last !== null) {
            const [t, b, c, g, s] = last;
            setNow({
              throttle: t ?? null,
              brake: b ?? null,
              clutch: c === null || c === undefined ? null : 1 - c,
              gear: g ?? null,
              speedMs: s ?? null,
            });
            draw();
          }
        } else {
          catalogId = null;
          sinceTick = null;
          setNow(null);
        }
      } catch {
        if (active) setNow(null);
      }
      if (active) timer = setTimeout(() => void poll(), connected ? POLL_INTERVAL_MS : IDLE_INTERVAL_MS);
    };

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [seconds]);

  if (now === null && !editing) return null;

  const gear = now?.gear ?? null;
  return (
    <div className="ov-panel ov-inputs">
      <canvas ref={canvas} width={TRACE_WIDTH} height={TRACE_HEIGHT} className="ov-inputs__trace" />
      <div className="ov-inputs__bars" aria-hidden="true">
        <Bar value={now?.clutch ?? null} className="is-clutch" />
        <Bar value={now?.brake ?? null} className="is-brake" />
        <Bar value={now?.throttle ?? null} className="is-throttle" />
      </div>
      <div className="ov-inputs__gear">
        <span className="ov-inputs__gear-value">
          {gear === null ? '—' : gear < 0 ? 'R' : gear === 0 ? 'N' : gear}
        </span>
        <span className="ov-inputs__speed">
          {now?.speedMs === null || now?.speedMs === undefined ? '—' : Math.round(now.speedMs * 3.6)}
          <small> km/h</small>
        </span>
      </div>
    </div>
  );
}

function Bar({ value, className }: { value: number | null; className: string }) {
  const fill = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <span className={`ov-inputs__bar ${className}`}>
      <span className="ov-inputs__bar-fill" style={{ height: `${fill * 100}%` }} />
    </span>
  );
}
