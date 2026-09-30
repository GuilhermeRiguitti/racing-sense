import { type RefObject, useEffect, useState } from 'react';
import type { OverlayFrameDto, OverlaySettings, WidgetId } from '../../../shared/overlay.js';
import { bridge } from '../bridge.js';

/** Sem sessão no sim, nada muda depressa: pergunta uma vez por segundo. */
const IDLE_INTERVAL_MS = 1000;

/**
 * A configuração do overlay, relida a cada aviso de mudança. O aviso não traz a
 * configuração: quem recebe consulta de novo (evento é aviso, não dado).
 */
export function useOverlaySettings(): OverlaySettings | null {
  const [settings, setSettings] = useState<OverlaySettings | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      void bridge()
        .getOverlaySettings()
        .then((result) => {
          if (active && result.failed !== true) setSettings(result.value);
        });
    };
    load();
    const stop = bridge().onEvent((event) => {
      if (event.type === 'overlay-settings-changed') load();
    });
    return () => {
      active = false;
      stop();
    };
  }, []);

  return settings;
}

export type FrameState = OverlayFrameDto | { readonly state: 'loading' } | { readonly state: 'failed' };

/**
 * O quadro do widget, perguntado no ritmo que ele precisa. O próximo pedido só
 * sai depois da resposta: nunca empilha, e o processo principal lê o sim uma vez
 * por tick para todas as janelas.
 */
export function useOverlayFrame(widget: WidgetId, intervalMs: number): FrameState {
  const [frame, setFrame] = useState<FrameState>({ state: 'loading' });

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      let connected = false;
      try {
        const result = await bridge().getOverlayFrame(widget);
        if (!active) return;
        if (result.failed === true) {
          setFrame({ state: 'failed' });
        } else {
          connected = result.value.state === 'connected';
          const value = result.value;
          setFrame((before) =>
            !connected && before.state === value.state ? before : value,
          );
        }
      } catch {
        if (active) setFrame({ state: 'failed' });
      }
      if (active) timer = setTimeout(() => void poll(), connected ? intervalMs : IDLE_INTERVAL_MS);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [widget, intervalMs]);

  return frame;
}

/**
 * Diz ao processo principal o tamanho do que foi desenhado, para a janela ter
 * exatamente esse tamanho — janela transparente maior que o conteúdo seria uma
 * área invisível por cima do sim.
 */
export function useFitWindow(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const report = () => bridge().fitOverlay(element.offsetWidth, element.offsetHeight);
    const observer = new ResizeObserver(report);
    observer.observe(element);
    report();
    return () => observer.disconnect();
  }, [ref]);
}

/** A hora local, de minuto em minuto: o relógio do cabeçalho do relative. */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
