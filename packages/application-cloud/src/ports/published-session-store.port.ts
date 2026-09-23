import type {
  PilotId,
  PublishedSession,
  PublishedSessionSummary,
  SessionId,
  ShareLink,
  ShareToken,
  Visibility,
} from '@telemetry/domain';

/**
 * Armazenamento das sessões publicadas. Vive no servidor (Postgres).
 *
 * Leitura e escrita separadas, como todo store deste projeto: uma query que
 * recebe só o leitor não tem como escrever.
 */
export interface PublishedSessionReaderPort {
  findById(id: SessionId): Promise<PublishedSession | null>;
  listByOwner(ownerId: PilotId): Promise<readonly PublishedSessionSummary[]>;
  listPublic(filter: {
    trackId?: string;
    carId?: string;
    limit: number;
  }): Promise<readonly PublishedSessionSummary[]>;
  findByShareToken(token: ShareToken): Promise<PublishedSession | null>;
}

export interface PublishedSessionWriterPort {
  save(session: PublishedSession): Promise<void>;
  setVisibility(id: SessionId, visibility: Visibility): Promise<void>;
  addShareLink(id: SessionId, link: ShareLink): Promise<void>;
  revokeShareLink(id: SessionId, token: ShareToken, revokedAt: Date): Promise<void>;
}

/** Geração de token de compartilhamento. Precisa ser imprevisível. */
export interface ShareTokenGeneratorPort {
  next(): ShareToken;
}
