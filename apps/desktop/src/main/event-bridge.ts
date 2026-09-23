import type { DesktopEvent, EventPublisherPort } from '@telemetry/application-desktop';
import { type DesktopEventDto, desktopEventDto } from '@telemetry/contracts';
import { IPC } from './ipc-contract.js';

/** Para onde o evento vai. Injetado para este arquivo rodar sem Electron no teste. */
export type EventSender = (channel: string, payload: DesktopEventDto) => void;

/** Traduz o evento da aplicação para o DTO que atravessa o IPC. */
export function toDesktopEventDto(event: DesktopEvent): DesktopEventDto {
  switch (event.type) {
    case 'session-ingested':
      return { type: event.type, sessionId: event.sessionId, lapCount: event.lapCount };
    case 'analysis-ready':
      return {
        type: event.type,
        sessionId: event.sessionId,
        lapNumber: event.lapNumber,
        referenceLapId: event.referenceLapId,
      };
    case 'publication-progressed':
      return { type: event.type, published: event.published, failed: event.failed };
  }
}

/**
 * Implementa a porta de eventos empurrando para as janelas abertas.
 *
 * Duas decisões que valem explicar:
 *
 * 1. **Nunca lança.** Um erro aqui não pode desfazer uma ingestão que já gravou.
 *    A falha é registrada e a vida segue — a próxima consulta da interface
 *    corrige a tela.
 * 2. **Sem janela, o evento é descartado.** Não há fila de eventos, de
 *    propósito: quando a janela abre, ela consulta o estado atual de qualquer
 *    jeito. Guardar eventos para reproduzir depois seria inventar um segundo
 *    caminho de verdade.
 */
export function createIpcEventPublisher(
  send: EventSender,
  onFailure: (error: unknown) => void = () => {},
): EventPublisherPort {
  return {
    publish(event: DesktopEvent) {
      try {
        // Validar na saída: erro de forma aparece aqui, não numa tela quebrada.
        send(IPC.events, desktopEventDto.parse(toDesktopEventDto(event)));
      } catch (error) {
        onFailure(error);
      }
    },
  };
}
