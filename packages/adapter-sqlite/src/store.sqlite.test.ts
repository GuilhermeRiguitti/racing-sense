import {
  describeIngestedFileLogContract,
  describeReferenceLapStoreContract,
  describeSessionStoreContract,
} from '@telemetry/application-desktop/testing';
import { createChannelSeries, toSessionId } from '@telemetry/domain';
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

describe('SqliteSessionStore, séries em binário', () => {
  const serieDeVolta = (canal: string, pontos: number, de: number, resolucao: number) =>
    createChannelSeries({
      channel: canal,
      unit: 'm/s',
      axis: 'lapDistPct',
      x: Array.from({ length: pontos }, (_, i) => (de + i) / (resolucao - 1)),
      y: Array.from({ length: pontos }, (_, i) => Math.sin(i / 50) * 60 + 70),
    });

  it('devolve a série com o mesmo eixo e valores que entraram', async () => {
    const store = createSqliteSessionStore(openDatabase(':memory:'));
    const session = aSession();
    const original = serieDeVolta('Speed', 4055, 1, 4057);

    await store.save({
      session,
      laps: [],
      seriesByLap: new Map([[3, [original]]]),
    });
    const [lida] = await store.readLapSeries(session.id, 3);

    expect(lida?.channel).toBe('Speed');
    expect(lida?.x.length).toBe(original.x.length);
    // O eixo é reconstruído da grade, não lido do banco: tem que bater ponto a ponto.
    for (let i = 0; i < original.x.length; i += 1) {
      expect(lida?.x[i] as number).toBeCloseTo(original.x[i] as number, 9);
    }
    // `y` passa por float32, então perde casas — mas não pode perder o pico.
    for (let i = 0; i < original.y.length; i += 1) {
      expect(lida?.y[i] as number).toBeCloseTo(original.y[i] as number, 4);
    }
    expect(Math.max(...(lida?.y ?? []))).toBeCloseTo(Math.max(...original.y), 4);
  });

  it('série que não é grade uniforme continua voltando inteira', async () => {
    const store = createSqliteSessionStore(openDatabase(':memory:'));
    const session = aSession();
    const irregular = createChannelSeries({
      channel: 'Brake',
      unit: '',
      axis: 'time',
      x: [0, 0.5, 3, 3.1],
      y: [1, 2, 3, 4],
    });

    await store.save({ session, laps: [], seriesByLap: new Map([[1, [irregular]]]) });
    const [lida] = await store.readLapSeries(session.id, 1);

    expect(lida?.y).toEqual([1, 2, 3, 4]);
  });

  it('volta sem série devolve lista vazia, não erro', async () => {
    const store = createSqliteSessionStore(openDatabase(':memory:'));
    const session = aSession();

    await store.save({ session, laps: [], seriesByLap: new Map() });

    expect(await store.readLapSeries(session.id, 99)).toEqual([]);
  });
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
