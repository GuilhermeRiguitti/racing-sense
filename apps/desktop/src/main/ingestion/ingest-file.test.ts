import { describe, expect, it, vi } from 'vitest';
import { openLocalStore } from '../db/local-store.js';
import { MissingChannelError, RepeatedLapNumberError } from '../domain/errors.js';
import { toSessionId } from '../domain/id.js';
import { aSession } from '../domain/testing.js';
import type { IbtFile } from '../ibt/ibt-file.js';
import type { DecodedMetadata } from '../ibt/ibt-telemetry-decoder.js';
import type { ChannelType } from '../domain/channel.js';
import { channelsToRecord, ingestTelemetryFile } from './ingest-file.js';

const PATH = '/telemetry/sessao.ibt';

const channel = (name: string) => ({
  name,
  description: name,
  unit: '',
  type: 'number' as const,
  valuesPerSample: 1,
});

const metadataWith = (channels: readonly string[]): DecodedMetadata => {
  const { id: _id, tickRate: _t, sampleCount: _s, channels: _c, ...session } = aSession();
  return { tickRate: 60, sampleCount: 120, channels: channels.map(channel), session };
};

/** Um `.ibt` falso: catálogo e valores por canal, sem disco. */
function arquivoFalso(
  canais: Record<string, readonly number[]>,
  readChannel?: IbtFile['readChannel'],
): IbtFile & { close: ReturnType<typeof vi.fn> } {
  return {
    path: PATH,
    sizeBytes: 1024,
    readMetadata: async () => metadataWith(Object.keys(canais)),
    readTechnicalMetadata: vi.fn(),
    readChannel:
      readChannel ??
      async function* (nome) {
        yield* canais[nome] ?? [];
      },
    close: vi.fn(async () => undefined),
  };
}

function contexto(arquivo: IbtFile) {
  const store = openLocalStore(':memory:');
  const emit = vi.fn();
  const open = vi.fn(async () => arquivo);
  return { store, emit, open };
}

/** Duas voltas completas e as pontas cortadas pela gravação. */
function voltas(numeros: readonly number[], amostras = 30) {
  const lap: number[] = [];
  const pct: number[] = [];
  for (const numero of numeros) {
    for (let i = 0; i < amostras; i += 1) {
      lap.push(numero);
      pct.push(i / amostras);
    }
  }
  return { Lap: lap, LapDistPct: pct };
}

describe('ingestTelemetryFile', () => {
  it('grava sessão e voltas, enfileira a publicação e só então anuncia', async () => {
    const arquivo = arquivoFalso({ ...voltas([1, 2, 3]), Speed: new Array(90).fill(40) });
    const ctx = contexto(arquivo);

    const sessionId = await ingestTelemetryFile(ctx, PATH);

    expect(ctx.store.findSession(sessionId)).not.toBeNull();
    expect(ctx.store.listLaps(sessionId).map((lap) => lap.number)).toEqual([1, 2, 3]);
    expect(ctx.store.readLapSeries(sessionId, 2).map((serie) => serie.channel)).toEqual(['Speed']);
    expect(ctx.store.pendingPublications(10)).toEqual([sessionId]);
    expect(ctx.emit).toHaveBeenCalledWith({ type: 'session-ingested', sessionId, lapCount: 3 });
    expect(arquivo.close).toHaveBeenCalled();
  });

  it('recusa arquivo sem os canais necessários, nomeando o que falta', async () => {
    const ctx = contexto(arquivoFalso({ Speed: [] }));

    await expect(ingestTelemetryFile(ctx, PATH)).rejects.toThrow(MissingChannelError);
    await expect(ingestTelemetryFile(ctx, PATH)).rejects.toThrow(/LapDistPct/);
    expect(ctx.store.listSessions()).toEqual([]);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('fecha o arquivo mesmo quando a ingestão falha', async () => {
    // Disco com defeito no meio da leitura: o catálogo passou, os bytes não.
    const arquivo = arquivoFalso({ Lap: [], LapDistPct: [] }, async function* () {
      yield 0;
      throw new Error('leitura interrompida no meio do arquivo');
    });
    const ctx = contexto(arquivo);

    await expect(ingestTelemetryFile(ctx, PATH)).rejects.toThrow(/leitura interrompida/);
    expect(arquivo.close).toHaveBeenCalled();
    // Ingestão que falhou não anuncia sessão nova: evento é fato consumado.
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

describe('ingestTelemetryFile, contador de voltas que reinicia', () => {
  it('recusa gravar duas voltas com o mesmo número e diz as sessões do sim', async () => {
    // Voltas 1, 2, 1, 2: o contador reiniciou no meio do arquivo, na sessão 2.
    const { Lap, LapDistPct } = voltas([1, 2, 1, 2]);
    const SessionNum = Lap.map((_, i) => (i < 60 ? 0 : 2));
    const arquivo = arquivoFalso({ Lap, LapDistPct, SessionNum });
    const ctx = contexto(arquivo);

    await expect(ingestTelemetryFile(ctx, PATH)).rejects.toThrow(RepeatedLapNumberError);
    await expect(ingestTelemetryFile(ctx, PATH)).rejects.toThrow(/SessionNum\): 0, 2/);
    expect(ctx.store.listSessions()).toEqual([]);
    expect(arquivo.close).toHaveBeenCalled();
  });
});

describe('ingestTelemetryFile, idempotência por arquivo', () => {
  it('arquivo já ingerido devolve a sessão existente sem reabrir nada', async () => {
    const ctx = contexto(arquivoFalso({}));
    ctx.store.recordIngestedFile(PATH, toSessionId('session-de-ontem'));

    await expect(ingestTelemetryFile(ctx, PATH)).resolves.toBe('session-de-ontem');
    // Nem abre o arquivo: é isso que deixa o watcher varrer a pasta toda a cada
    // abertura do aplicativo sem custo.
    expect(ctx.open).not.toHaveBeenCalled();
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

describe('ingestTelemetryFile, o que o engenheiro olha', () => {
  it('grava pneu e ajuste de dentro do carro que o arquivo tiver', async () => {
    const arquivo = arquivoFalso({
      ...voltas([1, 2, 3]),
      LFtempCM: new Array(90).fill(80),
      dcBrakeBias: new Array(90).fill(54.5),
    });
    const ctx = contexto(arquivo);

    const sessionId = await ingestTelemetryFile(ctx, PATH);

    expect(ctx.store.readLapSeries(sessionId, 2).map((serie) => serie.channel)).toEqual([
      'LFtempCM',
      'dcBrakeBias',
    ]);
  });

  it('guarda com a volta onde ela saiu da pista, na posição medida', async () => {
    const { Lap, LapDistPct } = voltas([1, 2, 3], 10);
    // Fora da pista (código 0) na 4ª e 5ª amostras da volta 2; 3 é "na pista".
    const superficie = LapDistPct.map((_, i) => (i === 13 || i === 14 ? 0 : 3));
    const ctx = contexto(arquivoFalso({ Lap, LapDistPct, PlayerTrackSurface: superficie }));

    const sessionId = await ingestTelemetryFile(ctx, PATH);

    const volta2 = ctx.store.listLaps(sessionId).find((lap) => lap.number === 2);
    expect(volta2?.flags).toContain('off-track');
    expect(volta2?.offTrackStretches).toEqual([{ startPct: 0.3, endPct: 0.4 }]);
  });
});

describe('ingestTelemetryFile, slow down', () => {
  it('marca a volta em que a bandeira de advertência do sim acendeu', async () => {
    const { Lap, LapDistPct } = voltas([1, 2, 3], 10);
    // 0x80000 é irsdk_furled; 0x40000 fica aceso a sessão toda e não é punição.
    const flags = LapDistPct.map((_, i) => (i === 15 ? 0x80000 | 0x40000 : 0x40000));
    const ctx = contexto(arquivoFalso({ Lap, LapDistPct, SessionFlags: flags }));

    const sessionId = await ingestTelemetryFile(ctx, PATH);

    const flagsPorVolta = ctx.store.listLaps(sessionId).map((lap) => lap.flags);
    expect(flagsPorVolta[1]).toContain('slowdown');
    expect(flagsPorVolta[0]).not.toContain('slowdown');
  });
});

describe('ingestTelemetryFile, incidentes', () => {
  it('guarda com cada volta os incidentes que ela somou', async () => {
    const { Lap, LapDistPct } = voltas([1, 2, 3], 10);
    // Chega em 5 vindo de antes; sobe 2 na volta 2.
    const contador = LapDistPct.map((_, i) => (i < 14 ? 5 : 7));
    const ctx = contexto(
      arquivoFalso({ Lap, LapDistPct, PlayerCarMyIncidentCount: contador }),
    );

    const sessionId = await ingestTelemetryFile(ctx, PATH);

    expect(ctx.store.listLaps(sessionId).map((lap) => lap.incidents)).toEqual([0, 2, 0]);
  });
});

describe('ingestTelemetryFile, setores', () => {
  it('guarda a sessão com os setores e cada volta cronometrada com o tempo deles', async () => {
    const { Lap, LapDistPct } = voltas([1, 2, 3], 10);
    const arquivo = arquivoFalso({ Lap, LapDistPct });
    const metadata = metadataWith(['Lap', 'LapDistPct']);
    arquivo.readMetadata = async () => ({
      ...metadata,
      session: { ...metadata.session, sectorStartPcts: [0, 0.25, 0.5] },
    });
    const ctx = contexto(arquivo);

    const sessionId = await ingestTelemetryFile(ctx, PATH);

    expect(ctx.store.findSession(sessionId)?.sectorStartPcts).toEqual([0, 0.25, 0.5]);
    const [volta1, volta2, volta3] = ctx.store.listLaps(sessionId);
    // Volta 2: 10 ticks, um a cada 0,1. A divisa em 0,25 cai entre o 2º e o 3º.
    const tempos = volta2?.sectorTimes ?? [];
    expect(tempos).toHaveLength(3);
    expect(tempos[0]).toBeCloseTo(2.5 / 60, 12);
    expect(tempos[1]).toBeCloseTo(2.5 / 60, 12);
    expect(tempos[2]).toBeCloseTo(5 / 60, 12);
    // As pontas, cortadas pela gravação, não têm tempo de volta nem de setor.
    expect(volta1?.sectorTimes).toBeUndefined();
    expect(volta3?.sectorTimes).toBeUndefined();
  });

  it('arquivo sem setores declarados: nem a sessão nem as voltas ganham setores', async () => {
    const ctx = contexto(arquivoFalso(voltas([1, 2, 3], 10)));

    const sessionId = await ingestTelemetryFile(ctx, PATH);

    expect(ctx.store.findSession(sessionId)?.sectorStartPcts).toBeNull();
    expect(ctx.store.listLaps(sessionId).every((lap) => lap.sectorTimes === undefined)).toBe(true);
  });
});

describe('channelsToRecord', () => {
  const descritor = (name: string, type: ChannelType = 'number') => ({
    name,
    description: name,
    unit: '',
    type,
    valuesPerSample: 1,
  });

  it('pega os canais da lista que o arquivo tem, e ignora os que ele não tem', () => {
    expect(channelsToRecord([descritor('Speed'), descritor('LFpressure')])).toEqual([
      'Speed',
      'LFpressure',
    ]);
  });

  it('descobre os ajustes de dentro do carro pelo catálogo do próprio arquivo', () => {
    const catalogo = [
      descritor('dcBrakeBias'),
      descritor('dcTractionControl'),
      // Botão, não ajuste.
      descritor('dcPitSpeedLimiterToggle', 'boolean'),
      // Não é canal de ajuste, só começa parecido.
      descritor('dcx'),
    ];

    expect(channelsToRecord(catalogo)).toEqual(['dcBrakeBias', 'dcTractionControl']);
  });
});
