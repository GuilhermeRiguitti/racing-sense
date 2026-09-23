import type { ReferenceLapId, SessionId } from '@telemetry/domain';

/**
 * Fatos que o aplicativo anuncia enquanto o piloto está com ele aberto.
 *
 * O aplicativo é um coach que fica aberto durante o treino (ADR 0017): ele não
 * pode esperar alguém recarregar a tela para mostrar a volta que acabou de sair
 * do carro. Estes eventos são o empurrão.
 */
export type DesktopEvent =
  | {
      readonly type: 'session-ingested';
      readonly sessionId: SessionId;
      readonly lapCount: number;
    }
  | {
      readonly type: 'analysis-ready';
      readonly sessionId: SessionId;
      readonly lapNumber: number;
      readonly referenceLapId: ReferenceLapId;
    }
  | {
      readonly type: 'publication-progressed';
      readonly published: number;
      readonly failed: number;
    };

/**
 * Anúncio de evento.
 *
 * **Não devolve `Promise` e não pode falhar de forma que interesse a quem
 * chamou.** Um caso de uso que já gravou não pode ser desfeito porque a
 * interface não estava ouvindo — por isso a assinatura é `void`, e a
 * implementação engole o próprio erro.
 *
 * Evento é aviso, não fonte de verdade: quem recebe responde consultando de
 * novo. Assim, evento perdido custa uma tela desatualizada até a próxima
 * consulta, nunca um dado errado.
 */
export interface EventPublisherPort {
  publish(event: DesktopEvent): void;
}
