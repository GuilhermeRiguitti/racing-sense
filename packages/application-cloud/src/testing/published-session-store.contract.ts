import { toPilotId, toSessionId, toShareToken } from '@telemetry/domain';
import { aPublishedSession, aShareLink } from '@telemetry/domain/testing';
import { describe, expect, it } from 'vitest';
import type {
  PublishedSessionReaderPort,
  PublishedSessionWriterPort,
} from '../ports/published-session-store.port.js';

export interface PublishedSessionStoreUnderTest {
  readonly reader: PublishedSessionReaderPort;
  readonly writer: PublishedSessionWriterPort;
}

/**
 * Contrato do armazenamento das sessões publicadas.
 *
 * O adapter em memória passa hoje; o de Postgres terá que passar antes de
 * substituí-lo. É o que transforma "substituível" em fato verificado.
 */
export function describePublishedSessionStoreContract(
  name: string,
  createStore: () => PublishedSessionStoreUnderTest,
): void {
  describe(`${name} cumpre o contrato de PublishedSessionStore`, () => {
    it('devolve a sessão publicada', async () => {
      const { reader, writer } = createStore();
      const published = aPublishedSession();

      await writer.save(published);

      await expect(reader.findById(published.session.id)).resolves.toMatchObject({
        ownerId: published.ownerId,
      });
    });

    it('devolve null para sessão inexistente', async () => {
      const { reader } = createStore();

      await expect(reader.findById(toSessionId('não-existe'))).resolves.toBeNull();
    });

    it('lista só o que é público', async () => {
      const { reader, writer } = createStore();
      const dono = toPilotId('piloto-1');

      await writer.save(aPublishedSession({ ownerId: dono, visibility: 'private' }));
      await writer.save(
        aPublishedSession({
          ownerId: dono,
          visibility: 'public',
          session: { ...aPublishedSession().session, id: toSessionId('session-publica') },
        }),
      );

      const publicas = await reader.listPublic({ limit: 10 });

      expect(publicas).toHaveLength(1);
      expect(publicas[0]?.visibility).toBe('public');
    });

    it('lista as sessões do dono, públicas ou não', async () => {
      const { reader, writer } = createStore();
      const dono = toPilotId('piloto-1');

      await writer.save(aPublishedSession({ ownerId: dono, visibility: 'private' }));

      await expect(reader.listByOwner(dono)).resolves.toHaveLength(1);
      await expect(reader.listByOwner(toPilotId('outro'))).resolves.toEqual([]);
    });

    it('resume a melhor volta completa', async () => {
      const { reader, writer } = createStore();
      const dono = toPilotId('piloto-1');
      const published = aPublishedSession({
        ownerId: dono,
        laps: [
          {
            number: 1,
            startSample: 0,
            endSample: 10,
            lapTimeSeconds: 80,
            isComplete: true,
            flags: [],
          },
          {
            number: 2,
            startSample: 10,
            endSample: 20,
            lapTimeSeconds: 75.4,
            isComplete: true,
            flags: [],
          },
          {
            number: 3,
            startSample: 20,
            endSample: 30,
            lapTimeSeconds: 60,
            isComplete: false,
            flags: ['incomplete'],
          },
        ],
      });

      await writer.save(published);
      const [resumo] = await reader.listByOwner(dono);

      // A volta de 60 s é incompleta (in lap): não pode virar "melhor volta".
      expect(resumo?.bestLapTimeSeconds).toBe(75.4);
      expect(resumo?.lapCount).toBe(3);
    });

    it('muda a visibilidade sem perder o resto', async () => {
      const { reader, writer } = createStore();
      const published = aPublishedSession({ visibility: 'private' });

      await writer.save(published);
      await writer.setVisibility(published.session.id, 'public');

      await expect(reader.findById(published.session.id)).resolves.toMatchObject({
        visibility: 'public',
        ownerId: published.ownerId,
      });
    });

    it('encontra a sessão pelo token de compartilhamento', async () => {
      const { reader, writer } = createStore();
      const published = aPublishedSession({ visibility: 'unlisted' });

      await writer.save(published);
      await writer.addShareLink(published.session.id, aShareLink());

      const encontrada = await reader.findByShareToken(toShareToken('token-abc'));

      expect(encontrada?.session.id).toBe(published.session.id);
    });

    it('token desconhecido não encontra sessão nenhuma', async () => {
      const { reader, writer } = createStore();
      const published = aPublishedSession({ visibility: 'unlisted' });

      await writer.save(published);
      await writer.addShareLink(published.session.id, aShareLink());

      await expect(reader.findByShareToken(toShareToken('token-inventado'))).resolves.toBeNull();
    });

    it('revoga o link marcando a data, sem apagar o registro', async () => {
      const { reader, writer } = createStore();
      const published = aPublishedSession({ visibility: 'unlisted' });
      const revokedAt = new Date('2026-09-18T10:00:00Z');

      await writer.save(published);
      await writer.addShareLink(published.session.id, aShareLink());
      await writer.revokeShareLink(published.session.id, toShareToken('token-abc'), revokedAt);

      const stored = await reader.findById(published.session.id);

      // O link continua existindo, revogado: histórico de quem teve acesso importa.
      expect(stored?.shareLinks[0]?.revokedAt).toEqual(revokedAt);
    });
  });
}
