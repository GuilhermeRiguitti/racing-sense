import {
  describeIngestedFileLogContract,
  describeReferenceLapStoreContract,
  describeSessionStoreContract,
} from '@telemetry/application-desktop/testing';
import { toSessionId } from '@telemetry/domain';
import { aSession } from '@telemetry/domain/testing';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './database.js';
import { createSqliteIngestedFileLog } from './ingested-file-log.sqlite.js';
import { createSqlitePublicationQueue } from './publication-queue.sqlite.js';
import { createSqliteReferenceLapStore } from './reference-lap-store.sqlite.js';
import { createSqliteSessionStore } from './session-store.sqlite.js';

/**
 * As mesmas suítes que o adapter em memória roda. Passar nas duas é o que
 * significa "um pode substituir o outro" — ver ADR 0009.
 */
describeSessionStoreContract('SqliteSessionStore', () => {
  const store = createSqliteSessionStore(openDatabase(':memory:'));
  return { reader: store, writer: store };
});

describeReferenceLapStoreContract('SqliteReferenceLapStore', () => {
  const store = createSqliteReferenceLapStore(openDatabase(':memory:'));
  return { reader: store, writer: store };
});

describeIngestedFileLogContract('SqliteIngestedFileLog', () => {
  const log = createSqliteIngestedFileLog(openDatabase(':memory:'));
  return { reader: log, writer: log };
});

describe('SqliteSessionStore, além do contrato', () => {
  it('não perde a data de gravação na ida e volta pelo JSON', async () => {
    const store = createSqliteSessionStore(openDatabase(':memory:'));
    const session = aSession({ recordedAt: new Date('2026-09-17T13:45:00.000Z') });

    await store.save({ session, laps: [], seriesByLap: new Map() });
    const lido = await store.findById(session.id);

    expect(lido?.recordedAt).toBeInstanceOf(Date);
    expect(lido?.recordedAt?.toISOString()).toBe('2026-09-17T13:45:00.000Z');
  });

  it('preserva as condições da sessão, que é o que torna a comparação honesta', async () => {
    const store = createSqliteSessionStore(openDatabase(':memory:'));
    const session = aSession();

    await store.save({ session, laps: [], seriesByLap: new Map() });

    expect((await store.findById(session.id))?.conditions).toEqual(session.conditions);
  });
});

describe('SqlitePublicationQueue', () => {
  it('devolve o pendente na ordem em que entrou e some depois de publicado', async () => {
    const queue = createSqlitePublicationQueue(openDatabase(':memory:'));
    const [a, b] = [toSessionId('session-a'), toSessionId('session-b')];

    await queue.enqueue(a);
    await queue.enqueue(b);
    expect(await queue.pending(10)).toEqual([a, b]);

    await queue.markPublished(a);
    expect(await queue.pending(10)).toEqual([b]);
  });

  it('enfileirar duas vezes a mesma sessão não duplica', async () => {
    const queue = createSqlitePublicationQueue(openDatabase(':memory:'));
    const a = toSessionId('session-a');

    await queue.enqueue(a);
    await queue.enqueue(a);

    expect(await queue.pending(10)).toHaveLength(1);
  });

  it('falha mantém a sessão na fila para a próxima tentativa', async () => {
    const queue = createSqlitePublicationQueue(openDatabase(':memory:'));
    const a = toSessionId('session-a');

    await queue.enqueue(a);
    await queue.markFailed(a, 'sem rede');

    expect(await queue.pending(10)).toEqual([a]);
  });

  it('respeita o limite pedido', async () => {
    const queue = createSqlitePublicationQueue(openDatabase(':memory:'));
    for (const id of ['a', 'b', 'c']) {
      await queue.enqueue(toSessionId(id));
    }

    expect(await queue.pending(2)).toHaveLength(2);
  });
});
