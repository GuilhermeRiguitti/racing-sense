import type { PublishedSessionSummary, SessionId } from '@telemetry/domain';

/**
 * Publicação de sessões na nuvem.
 *
 * O desktop publica **tudo** que ingere, automaticamente — mas nunca no caminho
 * crítico: quem chama é o flush da fila, nunca a ingestão. Sem internet, o
 * aplicativo inteiro continua funcionando; só o que os outros pilotos veem
 * atrasa. Ver `docs/adr/0013-sincronizacao-e-visibilidade.md`.
 */
export interface SessionPublisherPort {
  /** Envia a sessão inteira: metadados, condições, voltas e séries. */
  publish(sessionId: SessionId): Promise<void>;
}

/**
 * Fila de publicação, persistida localmente.
 *
 * Sobrevive a reinício e a queda de rede. É a razão de "publica tudo
 * automaticamente" não significar "perde tudo que aconteceu offline".
 */
export interface PublicationQueuePort {
  enqueue(sessionId: SessionId): Promise<void>;
  /** Próximas sessões a tentar, mais antigas primeiro. */
  pending(limit: number): Promise<readonly SessionId[]>;
  markPublished(sessionId: SessionId): Promise<void>;
  /** Registra a falha para backoff; a sessão continua na fila. */
  markFailed(sessionId: SessionId, reason: string): Promise<void>;
}

/** Catálogo remoto: as voltas dos outros pilotos que este piloto pode ver. */
export interface CloudCatalogPort {
  listPublicSessions(filter: {
    trackId?: string;
    carId?: string;
    limit: number;
  }): Promise<readonly PublishedSessionSummary[]>;
}
