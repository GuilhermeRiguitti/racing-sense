import { useEffect, useState } from 'react';
import type { LiveCatalogDto, LiveValueDto } from '../../shared/dto.js';
import { bridge } from './bridge.js';

/**
 * Quanto esperar entre uma resposta e o próximo pedido.
 *
 * É ritmo de tela, não de análise: dez quadros por segundo bastam para ler um
 * número mudando, e cada pedido é uma cópia de ~1 KB no processo principal. Os
 * 60 Hz do sim continuam inteiros na memória compartilhada; a tela só não
 * precisa de todos.
 */
const POLL_INTERVAL_MS = 100;

export type LiveState =
  | { readonly state: 'loading' }
  | { readonly state: 'sim-closed' }
  | { readonly state: 'disconnected' }
  | { readonly state: 'failed'; readonly message: string }
  | {
      readonly state: 'connected';
      readonly catalog: LiveCatalogDto;
      readonly tickCount: number;
      readonly values: readonly LiveValueDto[];
      /**
       * Índices dos canais cujo valor já mudou desde que o catálogo chegou.
       * É a medida do que o sim está de fato atualizando agora — canal que não
       * muda pode ser só o carro parado, ou dado que o sim não libera ao vivo.
       */
      readonly changed: ReadonlySet<number>;
    };

/**
 * Pergunta o frame mais recente ao processo principal enquanto a tela está
 * aberta. O próximo pedido só sai depois da resposta: nunca empilha.
 */
export function useLiveTelemetry(): LiveState {
  const [live, setLive] = useState<LiveState>({ state: 'loading' });

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let catalog: LiveCatalogDto | null = null;
    let first: readonly LiveValueDto[] | null = null;
    let changed = new Set<number>();

    const poll = async () => {
      try {
        const result = await bridge().getLiveSnapshot(catalog?.catalogId ?? null);
        if (!active) return;
        if (result.failed === true) {
          setLive({ state: 'failed', message: result.message });
        } else if (result.value.state !== 'connected') {
          catalog = null;
          setLive({ state: result.value.state });
        } else {
          const snapshot = result.value;
          if (snapshot.catalog !== null) {
            catalog = snapshot.catalog;
            first = snapshot.values;
            changed = new Set();
          }
          if (catalog !== null && first !== null) {
            const before = changed.size;
            snapshot.values.forEach((value, index) => {
              if (!changed.has(index) && !sameValue(value, first?.[index])) changed.add(index);
            });
            if (changed.size !== before) changed = new Set(changed);
            setLive({
              state: 'connected',
              catalog,
              tickCount: snapshot.tickCount,
              values: snapshot.values,
              changed,
            });
          }
        }
      } catch (error) {
        if (active) setLive({ state: 'failed', message: String(error) });
      }
      if (active) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  return live;
}

function sameValue(a: LiveValueDto, b: LiveValueDto | undefined): boolean {
  if (b === undefined) return false;
  // `Object.is`: canal que o sim deixa em NaN não conta como mudando a cada frame.
  if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b);
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}
