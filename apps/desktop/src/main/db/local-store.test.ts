import { describe, expect, it } from 'vitest';
import { type ChannelSeries, createChannelSeries } from '../domain/channel.js';
import { toReferenceLapId, toSessionId } from '../domain/id.js';
import { aLap, aReferenceLap, aSeries, aSession } from '../domain/testing.js';
import { openLocalStore } from './local-store.js';

const novo = () => openLocalStore(':memory:');

describe('LocalStore, sessões', () => {
  it('devolve a sessão gravada', () => {
    const store = novo();
    const session = aSession();

    store.saveRecording({ session, laps: [aLap()], seriesByLap: new Map() });

    expect(store.findSession(session.id)).toMatchObject({ id: session.id });
    expect(store.listSessions()).toHaveLength(1);
  });

  it('devolve null para sessão inexistente, não erro', () => {
    expect(novo().findSession(toSessionId('não-existe'))).toBeNull();
  });

  it('devolve as voltas gravadas com a sessão, e vazio para sessão inexistente', () => {
    const store = novo();
    const session = aSession();

    store.saveRecording({
      session,
      laps: [aLap({ number: 1 }), aLap({ number: 2 })],
      seriesByLap: new Map(),
    });

    expect(store.listLaps(session.id)).toHaveLength(2);
    expect(store.listLaps(toSessionId('não-existe'))).toEqual([]);
  });

  it('sobrescreve a sessão quando gravada de novo, sem duplicar', () => {
    const store = novo();
    const session = aSession();

    store.saveRecording({ session, laps: [aLap()], seriesByLap: new Map() });
    store.saveRecording({
      session: { ...session, driverName: 'Outro Piloto' },
      laps: [aLap()],
      seriesByLap: new Map(),
    });

    expect(store.listSessions()).toHaveLength(1);
    expect(store.findSession(session.id)).toMatchObject({ driverName: 'Outro Piloto' });
  });

  it('apaga a sessão e o que veio com ela, inclusive o registro do arquivo', () => {
    const store = novo();
    const session = aSession();

    store.saveRecording({
      session,
      laps: [aLap({ number: 4 })],
      seriesByLap: new Map([[4, [aSeries()]]]),
    });
    store.recordIngestedFile('C:\\telemetry\\sessao.ibt', session.id);
    store.deleteSession(session.id);

    expect(store.findSession(session.id)).toBeNull();
    expect(store.listLaps(session.id)).toEqual([]);
    expect(store.readLapSeries(session.id, 4)).toEqual([]);
    // O arquivo pode voltar a ser ingerido.
    expect(store.findSessionByLocator('C:\\telemetry\\sessao.ibt')).toBeNull();
  });

  it('apagar sessão inexistente é no-op, não erro', () => {
    expect(() => novo().deleteSession(toSessionId('não-existe'))).not.toThrow();
  });

  it('não perde a data de gravação na ida e volta pelo JSON', () => {
    const store = novo();
    const session = aSession({ recordedAt: new Date('2026-09-17T13:45:00.000Z') });

    store.saveRecording({ session, laps: [], seriesByLap: new Map() });
    const lido = store.findSession(session.id);

    expect(lido?.recordedAt).toBeInstanceOf(Date);
    expect(lido?.recordedAt?.toISOString()).toBe('2026-09-17T13:45:00.000Z');
  });

  it('preserva as condições da sessão, que é o que torna a comparação honesta', () => {
    const store = novo();
    const session = aSession();

    store.saveRecording({ session, laps: [], seriesByLap: new Map() });

    expect(store.findSession(session.id)?.conditions).toEqual(session.conditions);
  });
});

describe('LocalStore, séries em binário sem perda', () => {
  const gravarELer = (series: ChannelSeries[]) => {
    const store = novo();
    const session = aSession();
    store.saveRecording({ session, laps: [], seriesByLap: new Map([[3, series]]) });
    return store.readLapSeries(session.id, 3);
  };

  it('devolve cada valor bit a bit, inclusive os que o arquivo grava como float', () => {
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

    const [lida] = gravarELer([original]);

    expect(lida?.x).toEqual(original.x);
    expect(lida?.y).toEqual(original.y);
  });

  it('não arredonda valor que só cabe em 64 bits', () => {
    // Canal `double` do arquivo, como `SessionTime`: float32 perderia casas.
    const tempo = createChannelSeries({
      channel: 'SessionTime',
      unit: 's',
      type: 'number',
      axis: 'time',
      x: [0, 1, 2],
      y: [3047.316666666667, 3047.333333333333, 3047.35],
    });

    const [lida] = gravarELer([tempo]);

    expect(lida?.y).toEqual(tempo.y);
  });

  it('não corrompe bitfield com bit alto ligado', () => {
    // Máscara de bandeira: acima de 2^24, float32 já não guarda o inteiro exato.
    const bandeiras = createChannelSeries({
      channel: 'SessionFlags',
      unit: '',
      type: 'bitfield',
      axis: 'time',
      x: [0, 1],
      y: [0x10000004, 0x80000000 - 1],
    });

    const [lida] = gravarELer([bandeiras]);

    expect(lida?.y).toEqual(bandeiras.y);
  });

  it('marcha volta inteira e com o tipo preservado', () => {
    const marcha = createChannelSeries({
      channel: 'Gear',
      unit: '',
      type: 'integer',
      axis: 'lapDistPct',
      x: [0, 0.3, 0.6].map(Math.fround),
      y: [3, 4, 5],
    });

    const [lida] = gravarELer([marcha]);

    expect(lida?.y).toEqual([3, 4, 5]);
    expect(lida?.type).toBe('integer');
  });

  it('canais com o mesmo eixo e canal com eixo próprio voltam cada um com o seu', () => {
    // Na gravação o eixo idêntico é guardado uma vez só. A leitura tem que
    // devolver o eixo certo para cada série — inclusive a que não compartilha.
    const eixo = [0, 0.25, 0.5].map(Math.fround);
    const outroEixo = [0, 0.4, 0.9].map(Math.fround);
    const serie = (channel: string, x: number[], y: number[]) =>
      createChannelSeries({ channel, unit: '', type: 'number', axis: 'lapDistPct', x, y });

    const lidas = gravarELer([
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

  it('volta sem série devolve lista vazia, não erro', () => {
    const store = novo();
    const session = aSession();
    store.saveRecording({ session, laps: [], seriesByLap: new Map() });

    expect(store.readLapSeries(session.id, 99)).toEqual([]);
  });
});

describe('LocalStore, voltas de referência', () => {
  it('devolve a referência gravada, com as séries', () => {
    const store = novo();
    const reference = aReferenceLap();

    store.saveReferenceLap(reference);
    const lida = store.findReferenceLap(reference.id);

    expect(lida).toMatchObject({ id: reference.id });
    expect(lida?.series).toHaveLength(reference.series.length);
    expect(lida?.series[0]?.axis).toBe('lapDistPct');
    expect(store.listReferenceLaps()).toHaveLength(1);
  });

  it('devolve null para referência inexistente', () => {
    expect(novo().findReferenceLap(toReferenceLapId('não-existe'))).toBeNull();
  });

  it('apaga a referência', () => {
    const store = novo();
    const reference = aReferenceLap();

    store.saveReferenceLap(reference);
    store.deleteReferenceLap(reference.id);

    expect(store.findReferenceLap(reference.id)).toBeNull();
    expect(store.listReferenceLaps()).toEqual([]);
  });
});

describe('LocalStore, relatórios do narrador', () => {
  it('guarda o relatório e devolve a data como Date', () => {
    const store = novo();
    const session = aSession();
    store.saveRecording({ session, laps: [aLap()], seriesByLap: new Map() });
    const report = {
      sessionId: session.id,
      lapNumber: 3,
      referenceLapId: toReferenceLapId('reference-1'),
      summary: 'Resumo',
      findings: [],
      model: 'fake',
      generatedAt: new Date('2026-09-17T12:00:00.000Z'),
    };

    store.saveAnalysisReport(report);
    const lido = store.findAnalysisReport(report);

    expect(lido).toEqual(report);
    expect(
      store.findAnalysisReport({ ...report, referenceLapId: toReferenceLapId('outra') }),
    ).toBeNull();
  });
});

describe('LocalStore, fila de publicação', () => {
  it('devolve o pendente na ordem em que entrou e some depois de publicado', () => {
    const store = novo();
    const [a, b] = [toSessionId('session-a'), toSessionId('session-b')];

    store.enqueuePublication(a);
    store.enqueuePublication(b);
    expect(store.pendingPublications(10)).toEqual([a, b]);

    store.markPublished(a);
    expect(store.pendingPublications(10)).toEqual([b]);
  });

  it('enfileirar duas vezes a mesma sessão não duplica', () => {
    const store = novo();
    const a = toSessionId('session-a');

    store.enqueuePublication(a);
    store.enqueuePublication(a);

    expect(store.pendingPublications(10)).toHaveLength(1);
  });

  it('falha mantém a sessão na fila para a próxima tentativa', () => {
    const store = novo();
    const a = toSessionId('session-a');

    store.enqueuePublication(a);
    store.markPublicationFailed(a, 'sem rede');

    expect(store.pendingPublications(10)).toEqual([a]);
  });

  it('respeita o limite pedido', () => {
    const store = novo();
    for (const id of ['a', 'b', 'c']) {
      store.enqueuePublication(toSessionId(id));
    }

    expect(store.pendingPublications(2)).toHaveLength(2);
  });
});

describe('LocalStore, arquivos já ingeridos', () => {
  const locator = 'C:\\Users\\piloto\\Documents\\iRacing\\telemetry\\sessao.ibt';

  it('devolve a sessão do arquivo registrado, e null para arquivo nunca ingerido', () => {
    const store = novo();

    expect(store.findSessionByLocator(locator)).toBeNull();
    store.recordIngestedFile(locator, toSessionId('session-1'));
    expect(store.findSessionByLocator(locator)).toBe('session-1');
  });

  it('registrar o mesmo arquivo de novo atualiza, não duplica', () => {
    const store = novo();

    store.recordIngestedFile(locator, toSessionId('session-1'));
    store.recordIngestedFile(locator, toSessionId('session-2'));

    expect(store.findSessionByLocator(locator)).toBe('session-2');
  });

  it('caminho é comparado como está: duas grafias diferentes são dois arquivos', () => {
    const store = novo();

    store.recordIngestedFile(locator, toSessionId('session-1'));

    // Normalizar caminho é responsabilidade de quem chama — aqui a comparação é
    // literal, e isso precisa estar claro.
    expect(store.findSessionByLocator(locator.toLowerCase())).toBeNull();
  });
});
