import { describe, expect, it, vi } from 'vitest';
import { openLocalStore } from '../db/local-store.js';
import { MissingChannelError, RepeatedLapNumberError } from '../domain/errors.js';
import { toSessionId } from '../domain/id.js';
import { aSession } from '../domain/testing.js';
import type { IbtFile } from '../ibt/ibt-file.js';
import type { DecodedMetadata } from '../ibt/ibt-telemetry-decoder.js';
import { ingestTelemetryFile } from './ingest-file.js';

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
