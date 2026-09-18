import type { DesktopEvent } from '@telemetry/application-desktop';
import { type DesktopEventDto, desktopEventDto } from '@telemetry/contracts';
import { toReferenceLapId, toSessionId } from '@telemetry/domain';
import { describe, expect, it, vi } from 'vitest';
import { createIpcEventPublisher, toDesktopEventDto } from './event-bridge.js';
import { IPC } from './ipc-contract.js';

describe('createIpcEventPublisher', () => {
  it('empurra o evento no canal de eventos, já validado', () => {
    const send = vi.fn();

    createIpcEventPublisher(send).publish({
      type: 'session-ingested',
      sessionId: toSessionId('session-1'),
      lapCount: 4,
    });

    expect(send).toHaveBeenCalledWith(IPC.events, {
      type: 'session-ingested',
      sessionId: 'session-1',
      lapCount: 4,
    });
  });

  it('nunca lança: ingestão gravada não pode ser desfeita por tela desligada', () => {
    const onFailure = vi.fn();
    const publisher = createIpcEventPublisher(() => {
      throw new Error('janela morreu no meio');
    }, onFailure);

    expect(() =>
      publisher.publish({ type: 'publication-progressed', published: 1, failed: 0 }),
    ).not.toThrow();
    expect(onFailure).toHaveBeenCalled();
  });

  it('todo evento da aplicação vira DTO válido', () => {
    const eventos: DesktopEvent[] = [
      { type: 'session-ingested', sessionId: toSessionId('s'), lapCount: 0 },
      {
        type: 'analysis-ready',
        sessionId: toSessionId('s'),
        lapNumber: 3,
        referenceLapId: toReferenceLapId('r'),
      },
      { type: 'publication-progressed', published: 2, failed: 1 },
    ];

    for (const evento of eventos) {
      expect(() => desktopEventDto.parse(toDesktopEventDto(evento))).not.toThrow();
    }
  });

  it('o evento não carrega dado, só o aviso do que mudou', () => {
    const send = vi.fn<(channel: string, payload: DesktopEventDto) => void>();

    createIpcEventPublisher(send).publish({
      type: 'analysis-ready',
      sessionId: toSessionId('session-1'),
      lapNumber: 3,
      referenceLapId: toReferenceLapId('reference-1'),
    });

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
