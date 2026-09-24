import { type DesktopEvent, IPC } from '../../shared/ipc.js';

/** Para onde o evento vai. Injetado para este arquivo rodar sem Electron no teste. */
export type EventSender = (channel: string, payload: DesktopEvent) => void;

/**
 * Copia só os campos que o evento declara.
 *
 * Tipagem estrutural deixaria passar um objeto com série ou relatório pendurado;
 * copiando campo a campo, o que atravessa o IPC é sempre só o aviso.
 */
function toWire(event: DesktopEvent): DesktopEvent {
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
 * Emissor de eventos que empurra para as janelas abertas.
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
export function createEventEmitter(
  send: EventSender,
  onFailure: (error: unknown) => void = () => {},
): (event: DesktopEvent) => void {
  return (event) => {
    try {
      send(IPC.events, toWire(event));
    } catch (error) {
      onFailure(error);
    }
  };
}
