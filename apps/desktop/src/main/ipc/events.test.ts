import { describe, expect, it, vi } from 'vitest';
import { type DesktopEvent, IPC } from '../../shared/ipc.js';
import { createEventEmitter } from './events.js';

describe('createEventEmitter', () => {
  it('empurra o evento no canal de eventos', () => {
    const send = vi.fn();

    createEventEmitter(send)({ type: 'session-ingested', sessionId: 'session-1', lapCount: 4 });

    expect(send).toHaveBeenCalledWith(IPC.events, {
      type: 'session-ingested',
      sessionId: 'session-1',
      lapCount: 4,
    });
  });

  it('nunca lança: ingestão gravada não pode ser desfeita por tela desligada', () => {
    const onFailure = vi.fn();
    const emit = createEventEmitter(() => {
      throw new Error('janela morreu no meio');
    }, onFailure);

    expect(() => emit({ type: 'publication-progressed', published: 1, failed: 0 })).not.toThrow();
    expect(onFailure).toHaveBeenCalled();
  });

  it('o evento não carrega dado, só o aviso do que mudou', () => {
    const send = vi.fn<(channel: string, payload: DesktopEvent) => void>();
    const comDadoPendurado = {
      type: 'analysis-ready' as const,
      sessionId: 'session-1',
      lapNumber: 3,
      referenceLapId: 'reference-1',
      report: { summary: 'não devia viajar' },
    };

    createEventEmitter(send)(comDadoPendurado);

    // Sem séries, sem relatório: quem recebe consulta. Evento é aviso, não fonte
    // de verdade — senão passariam a existir duas versões do mesmo dado.
    const payload = send.mock.calls[0]?.[1];
    expect(Object.keys(payload ?? {})).toEqual([
      'type',
      'sessionId',
      'lapNumber',
      'referenceLapId',
    ]);
  });
});
