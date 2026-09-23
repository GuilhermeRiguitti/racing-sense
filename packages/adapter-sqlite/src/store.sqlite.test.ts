import {
  describeIngestedFileLogContract,
  describeReferenceLapStoreContract,
  describeSessionStoreContract,
} from '@telemetry/application-desktop/testing';
import { type ChannelSeries, createChannelSeries, toSessionId } from '@telemetry/domain';
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

describe('SqliteSessionStore, séries em binário sem perda', () => {
  const gravarELer = async (series: ChannelSeries[]) => {
    const store = createSqliteSessionStore(openDatabase(':memory:'));
    const session = aSession();
    await store.save({ session, laps: [], seriesByLap: new Map([[3, series]]) });
    return store.readLapSeries(session.id, 3);
  };

  it('devolve cada valor bit a bit, inclusive os que o arquivo grava como float', async () => {
    // Valores como o decoder entrega: float32 do arquivo, já promovidos a number.
    const velocidade = [66.97, 18.39, 41.8].map(Math.fround);
    const original = createChannelSeries({
      channel: 'Speed',
      unit: 'm/s',
      type: 'number',
      axis: 'lapDistPct',
      // A distância levemente negativa que o sim reporta logo depois da linha.
      x: [-0.0000129, 0.5, 0.99994].map(Math.fround),
      y: velocidade,
    });

    const [lida] = await gravarELer([original]);

    expect(lida?.x).toEqual(original.x);
    expect(lida?.y).toEqual(original.y);
  });

  it('não arredonda valor que só cabe em 64 bits', async () => {
    // Canal `double` do arquivo, como `SessionTime`: float32 perderia casas.
    const tempo = createChannelSeries({
      channel: 'SessionTime',
      unit: 's',
      type: 'number',
      axis: 'time',
      x: [0, 1, 2],
      y: [3047.316666666667, 3047.333333333333, 3047.35],
    });

    const [lida] = await gravarELer([tempo]);

    expect(lida?.y).toEqual(tempo.y);
  });

  it('não corrompe bitfield com bit alto ligado', async () => {
    // Máscara de bandeira: acima de 2^24, float32 já não guarda o inteiro exato.
    const bandeiras = createChannelSeries({
      channel: 'SessionFlags',
      unit: '',
      type: 'bitfield',
      axis: 'time',
      x: [0, 1],
      y: [0x10000004, 0x80000000 - 1],
    });

    const [lida] = await gravarELer([bandeiras]);

    expect(lida?.y).toEqual(bandeiras.y);
  });

  it('marcha volta inteira e com o tipo preservado', async () => {
    const marcha = createChannelSeries({
      channel: 'Gear',
      unit: '',
      type: 'integer',
      axis: 'lapDistPct',
      x: [0, 0.3, 0.6].map(Math.fround),
      y: [3, 4, 5],
    });

    const [lida] = await gravarELer([marcha]);

    expect(lida?.y).toEqual([3, 4, 5]);
    expect(lida?.type).toBe('integer');
  });

  it('canais com o mesmo eixo e canal com eixo próprio voltam cada um com o seu', async () => {
    // Na gravação o eixo idêntico é guardado uma vez só. A leitura tem que
    // devolver o eixo certo para cada série — inclusive a que não compartilha.
    const eixo = [0, 0.25, 0.5].map(Math.fround);
    const outroEixo = [0, 0.4, 0.9].map(Math.fround);
    const serie = (channel: string, x: number[], y: number[]) =>
      createChannelSeries({ channel, unit: '', type: 'number', axis: 'lapDistPct', x, y });

    const lidas = await gravarELer([
      serie('Speed', eixo, [10, 20, 30]),
      serie('Brake', [...eixo], [0, 1, 0]),
      serie('Other', outroEixo, [5, 6, 7]),
      serie('Throttle', eixo, [1, 0, 1]),
    ]);

    expect(lidas.map((s) => s.x)).toEqual([eixo, eixo, outroEixo, eixo]);
    expect(lidas.map((s) => s.y)).toEqual([
      [10, 20, 30],
      [0, 1, 0],
      [5, 6, 7],
      [1, 0, 1],
    ]);
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
