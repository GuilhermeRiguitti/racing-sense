import { describe, expect, it } from 'vitest';
import { openLocalStore } from '../db/local-store.js';
import { createChannelSeries } from '../domain/channel.js';
import { downsample, toDistanceSeries } from '../domain/distance-series.js';
import { detectLaps } from '../domain/lap-detection.js';
import { channelsToRecord, ingestTelemetryFile } from '../ingestion/ingest-file.js';
import { type IbtFile, openIbtFile } from './ibt-file.js';

/**
 * Teste contra um `.ibt` de verdade.
 *
 * **Pula quando `TELEMETRY_FIXTURE` está vazia** — é a regra do projeto: teste
 * não pode falhar por ausência de fixture, porque `.ibt` não entra no
 * repositório (são grandes e têm nome de piloto dentro).
 *
 * Para rodar: `TELEMETRY_FIXTURE`, em `apps/desktop/.env.testing`, aponta para
 * um `.ibt` real — `tests/support/testing-env.ts` tenta preencher sozinho na primeira
 * execução. Caminho preenchido e arquivo que não abre falha
 * alto, com o caminho na mensagem — pular aí esconderia o erro de digitação.
 * Ver `docs/fixtures.md`.
 *
 * O que ele prova, e nenhum teste sintético provaria: que os offsets do formato
 * estão certos. Um offset errado não dá exceção — dá número plausível e sem
 * sentido. `LapDistPct` fora de [0, 1] é o detector: se o offset escorregar um
 * byte, aquilo vira lixo imediatamente.
 */
const fixture = process.env.TELEMETRY_FIXTURE;

const arquivo = fixture ? await openIbtFile(fixture) : null;

describe.skipIf(arquivo === null)('decodificação de um .ibt real', () => {
  const decoder = arquivo as IbtFile;
  const caminho = fixture as string;

  it('lê pista, carro e piloto da session info', async () => {
    const meta = await decoder.readMetadata();

    expect(meta.session.track.name.length).toBeGreaterThan(0);
    expect(meta.session.car.name.length).toBeGreaterThan(0);
    expect(meta.session.driverName).not.toBeNull();
    expect(meta.tickRate).toBeGreaterThan(0);
    expect(meta.sampleCount).toBeGreaterThan(0);
  });

  it('traz as condições que tornam a comparação honesta', async () => {
    const { conditions } = (await decoder.readMetadata()).session;

    // Um arquivo real tem temperatura; se vier tudo nulo, o mapeamento quebrou.
    expect(conditions.airTempCelsius).not.toBeNull();
    expect(conditions.trackTempCelsius).not.toBeNull();
    expect(conditions.timeOfDaySeconds).not.toBeNull();
  });

  it('declara os setores da pista, começando na linha', async () => {
    const { sectorStartPcts } = (await decoder.readMetadata()).session;

    // Se vier null, ou o bloco `SplitTimeInfo` mudou de forma, ou este arquivo
    // não o tem — nos dois casos a análise por setor some da tela.
    expect(sectorStartPcts).not.toBeNull();
    expect(sectorStartPcts?.[0]).toBe(0);
    expect(sectorStartPcts?.length).toBeGreaterThan(1);
  });

  it('monta o catálogo com os canais que o recorte de voltas exige', async () => {
    const nomes = (await decoder.readMetadata()).channels.map((c) => c.name);

    expect(nomes).toContain('Lap');
    expect(nomes).toContain('LapDistPct');
    expect(nomes).toContain('OnPitRoad');
    expect(nomes.length).toBeGreaterThan(100);
  });

  it('tem os canais de engenharia que a gravação pede, com os nomes que usamos', async () => {
    const meta = await decoder.readMetadata();
    const gravados = channelsToRecord(meta.channels);

    // Os nomes de pneu e suspensão vieram da documentação do SDK, não de um
    // arquivo. Se o sim os escreve diferente, eles somem da lista em silêncio
    // e a aba de pneus fica vazia — este teste é o que pega isso.
    expect(gravados).toContain('LFpressure');
    expect(gravados.some((nome) => /^LFtemp/.test(nome))).toBe(true);
    expect(gravados).toContain('LFrideHeight');
    expect(gravados).toContain('FuelLevel');
    expect(gravados.some((nome) => nome.startsWith('dc'))).toBe(true);
  });

  it('lê os limites do carro e, quando a série permite, o acerto', async () => {
    const { carLimits, setup } = (await decoder.readMetadata()).session;

    expect(carLimits.redlineRpm).not.toBeNull();
    expect(carLimits.fuelCapacityLiters).not.toBeNull();
    // Acerto fixo esconde a ficha; quando ela vem, vem como árvore com seções.
    if (setup !== null) {
      expect(setup.length).toBeGreaterThan(0);
      expect(setup.every((secao) => secao.children.length > 0 || secao.value !== null)).toBe(true);
    }
  });

  it('lê uma amostra por registro declarado, nem mais nem menos', async () => {
    const meta = await decoder.readMetadata();
    let lidas = 0;
    for await (const _ of decoder.readChannel('Lap')) {
      lidas += 1;
    }

    expect(lidas).toBe(meta.sampleCount);
  });

  it('o formato fecha no byte — a prova de que os offsets estão certos', async () => {
    // Duas identidades exatas, sem tolerância nenhuma. Um byte de deslocamento em
    // qualquer offset quebra as duas.
    //
    // Antes a prova era "LapDistPct fica em [0, 1]". Não é verdade: numa volta
    // válida de Suzuka o sim reporta -0,0000129 logo depois da linha. O teste
    // passava por sorte do arquivo escolhido.
    const { header, diskSubHeader, variables } = await decoder.readTechnicalMetadata();
    const bufOffset = header.varBufs[0]?.bufOffset ?? 0;
    const bytesPorTipo = [1, 1, 4, 4, 4, 8];

    expect(bufOffset + diskSubHeader.recordCount * header.bufLen).toBe(decoder.sizeBytes);
    expect(variables.reduce((soma, v) => soma + (bytesPorTipo[v.type] ?? 0) * v.count, 0)).toBe(
      header.bufLen,
    );
  });

  it('o número da volta só cresce ao longo da gravação', async () => {
    let anterior = Number.NEGATIVE_INFINITY;
    let sempreCrescente = true;
    for await (const volta of decoder.readChannel('Lap')) {
      if (volta < anterior) sempreCrescente = false;
      anterior = volta;
    }

    expect(sempreCrescente).toBe(true);
  });

  it('recorta as voltas e bate com o tempo que o próprio sim gravou', async () => {
    const meta = await decoder.readMetadata();
    const colher = async (canal: string): Promise<number[]> => {
      const valores: number[] = [];
      for await (const valor of decoder.readChannel(canal)) valores.push(valor);
      return valores;
    };

    const [lapNumber, lapDistPct, onPitRoad, surface, lastLapTime] = await Promise.all([
      colher('Lap'),
      colher('LapDistPct'),
      colher('OnPitRoad'),
      colher('PlayerTrackSurface'),
      colher('LapLastLapTime'),
    ]);

    const voltas = detectLaps({
      tickRate: meta.tickRate,
      lapNumber,
      lapDistPct,
      onPitRoad: onPitRoad.map((v) => v !== 0),
      offTrack: surface.map((v) => v === 0),
    });

    // A gravação sempre corta a primeira e a última: o piloto entrou no carro
    // no meio de uma volta e saiu no meio de outra.
    expect(voltas.length).toBeGreaterThanOrEqual(2);
    expect(voltas[0]?.flags).toContain('incomplete');
    expect(voltas.at(-1)?.flags).toContain('incomplete');

    const completas = voltas.filter((volta) => volta.isComplete);
    expect(completas.length).toBeGreaterThan(0);

    // A prova de fogo: para cada volta completa, o sim publica o tempo dela logo
    // no começo da volta seguinte. Os dois números têm que bater.
    for (const volta of completas) {
      const seguinte = voltas[voltas.indexOf(volta) + 1];
      if (seguinte === undefined) continue;
      // Uns segundos depois da virada: a publicação não é instantânea.
      const publicado = lastLapTime[seguinte.startSample + Math.round(meta.tickRate * 5)];
      if (publicado === undefined || publicado <= 0) continue; // volta invalidada pelo sim

      expect(volta.lapTimeSeconds).not.toBeNull();
      expect(Math.abs((volta.lapTimeSeconds as number) - publicado)).toBeLessThan(0.05);
    }
  });

  it('reamostra por distância sem perder o pico e sem inventar pista', async () => {
    const meta = await decoder.readMetadata();
    const colher = async (canal: string): Promise<number[]> => {
      const valores: number[] = [];
      for await (const valor of decoder.readChannel(canal)) valores.push(valor);
      return valores;
    };

    const [lapNumber, lapDistPct, onPitRoad, surface, speed] = await Promise.all([
      colher('Lap'),
      colher('LapDistPct'),
      colher('OnPitRoad'),
      colher('PlayerTrackSurface'),
      colher('Speed'),
    ]);

    const voltas = detectLaps({
      tickRate: meta.tickRate,
      lapNumber,
      lapDistPct,
      onPitRoad: onPitRoad.map((v) => v !== 0),
      offTrack: surface.map((v) => v === 0),
    });
    const volta = voltas.find((candidata) => candidata.isComplete);
    expect(volta).toBeDefined();
    const { startSample, endSample } = volta as NonNullable<typeof volta>;

    const bruto = speed.slice(startSample, endSample + 1);
    const posicoes = lapDistPct.slice(startSample, endSample + 1);
    const porDistancia = toDistanceSeries(
      createChannelSeries({
        channel: 'Speed',
        unit: 'm/s',
        type: 'number',
        axis: 'time',
        x: bruto.map((_, i) => i / meta.tickRate),
        y: bruto,
      }),
      posicoes,
      1000,
    );

    // O eixo tem que ser monótono: gráfico com x andando para trás desenha
    // rabisco, e delta fica sem sentido.
    for (let i = 1; i < porDistancia.x.length; i += 1) {
      expect(porDistancia.x[i] as number).toBeGreaterThan(porDistancia.x[i - 1] as number);
    }

    // A velocidade máxima da volta sobrevive à reamostragem.
    expect(Math.max(...porDistancia.y)).toBeCloseTo(Math.max(...bruto), 1);

    // E sobrevive também à redução para desenhar — é a razão de não usar média.
    const reduzida = downsample(porDistancia, 400);
    expect(reduzida.x.length).toBeLessThanOrEqual(402);
    expect(Math.max(...reduzida.y)).toBe(Math.max(...porDistancia.y));
    expect(Math.min(...reduzida.y)).toBe(Math.min(...porDistancia.y));
  });

  it('a ingestão grava cada amostra sem alterar um bit', async () => {
    // Ponta a ponta: o caso de uso real, o SQLite real, o arquivo real. O que
    // volta do banco tem que ser exatamente o que o arquivo tem — sem grade,
    // sem interpolação, sem arredondamento.
    const store = openLocalStore(':memory:');
    const sessionId = await ingestTelemetryFile({ store, emit: () => {} }, caminho);
    const voltas = store.listLaps(sessionId);
    const bruto = async (canal: string): Promise<number[]> => {
      const valores: number[] = [];
      for await (const valor of decoder.readChannel(canal)) valores.push(valor);
      return valores;
    };
    const [distancia, marcha, velocidade] = await Promise.all([
      bruto('LapDistPct'),
      bruto('Gear'),
      bruto('Speed'),
    ]);

    for (const volta of voltas) {
      const series = store.readLapSeries(sessionId, volta.number);
      const trecho = (valores: number[]) => valores.slice(volta.startSample, volta.endSample + 1);

      const gear = series.find((serie) => serie.channel === 'Gear');
      expect(gear?.type).toBe('integer');
      expect(gear?.x).toEqual(trecho(distancia));
      expect(gear?.y).toEqual(trecho(marcha));
      expect(series.find((serie) => serie.channel === 'Speed')?.y).toEqual(trecho(velocidade));
    }
    store.close();
  });

  it('em toda volta cronometrada, a soma dos setores é o tempo de volta', async () => {
    const store = openLocalStore(':memory:');
    const sessionId = await ingestTelemetryFile({ store, emit: () => {} }, caminho);
    const setores = store.findSession(sessionId)?.sectorStartPcts;
    const cronometradas = store.listLaps(sessionId).filter((volta) => volta.lapTimeSeconds !== null);

    expect(cronometradas.length).toBeGreaterThan(0);
    for (const volta of cronometradas) {
      const tempos = volta.sectorTimes ?? [];
      expect(tempos).toHaveLength(setores?.length ?? -1);
      // Volta que passou pela linha nas duas pontas amostrou todas as divisas.
      expect(tempos.every((tempo) => tempo !== null && tempo > 0)).toBe(true);
      const soma = tempos.reduce((total, tempo) => (total ?? 0) + (tempo ?? 0), 0);
      expect(soma).toBeCloseTo(volta.lapTimeSeconds as number, 9);
    }
    store.close();
  });

  it('canal inexistente falha dizendo o nome', async () => {
    await expect(async () => {
      for await (const _ of decoder.readChannel('CanalInventado')) {
        // não chega aqui
      }
    }).rejects.toThrow(/CanalInventado/);
  });
});
