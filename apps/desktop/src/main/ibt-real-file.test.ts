import { createFileTelemetrySource } from '@telemetry/adapter-fs';
import { createIbtTelemetryDecoder } from '@telemetry/adapter-ibt';
import type { TelemetryFileRef } from '@telemetry/application-desktop';
import { detectLaps } from '@telemetry/domain';
import { describe, expect, it } from 'vitest';

/**
 * Teste contra um `.ibt` de verdade.
 *
 * **Pula quando o arquivo não existe** — é a regra do projeto: teste não pode
 * falhar por ausência de fixture, porque `.ibt` não entra no repositório (são
 * grandes e têm nome de piloto dentro).
 *
 * Para rodar: ponha um arquivo em `fixtures/real/sample.ibt`, ou aponte
 * `TELEMETRY_FIXTURE` para um. Ver `docs/fixtures.md`.
 *
 * O que ele prova, e nenhum teste sintético provaria: que os offsets do formato
 * estão certos. Um offset errado não dá exceção — dá número plausível e sem
 * sentido. `LapDistPct` fora de [0, 1] é o detector: se o offset escorregar um
 * byte, aquilo vira lixo imediatamente.
 */
const fixture = process.env.TELEMETRY_FIXTURE ?? 'fixtures/real/sample.ibt';
const files = createFileTelemetrySource();

const abrir = async (): Promise<TelemetryFileRef | null> => {
  try {
    return await files.open(fixture);
  } catch {
    return null;
  }
};

const ref = await abrir();

describe.skipIf(ref === null)('decodificação de um .ibt real', () => {
  const decoder = createIbtTelemetryDecoder(files);

  it('lê pista, carro e piloto da session info', async () => {
    const meta = await decoder.readMetadata(ref as TelemetryFileRef);

    expect(meta.session.track.name.length).toBeGreaterThan(0);
    expect(meta.session.car.name.length).toBeGreaterThan(0);
    expect(meta.session.driverName).not.toBeNull();
    expect(meta.tickRate).toBeGreaterThan(0);
    expect(meta.sampleCount).toBeGreaterThan(0);
  });

  it('traz as condições que tornam a comparação honesta', async () => {
    const { conditions } = (await decoder.readMetadata(ref as TelemetryFileRef)).session;

    // Um arquivo real tem temperatura; se vier tudo nulo, o mapeamento quebrou.
    expect(conditions.airTempCelsius).not.toBeNull();
    expect(conditions.trackTempCelsius).not.toBeNull();
    expect(conditions.timeOfDaySeconds).not.toBeNull();
  });

  it('monta o catálogo com os canais que o recorte de voltas exige', async () => {
    const nomes = (await decoder.readMetadata(ref as TelemetryFileRef)).channels.map((c) => c.name);

    expect(nomes).toContain('Lap');
    expect(nomes).toContain('LapDistPct');
    expect(nomes).toContain('OnPitRoad');
    expect(nomes.length).toBeGreaterThan(100);
  });

  it('lê uma amostra por registro declarado, nem mais nem menos', async () => {
    const meta = await decoder.readMetadata(ref as TelemetryFileRef);
    let lidas = 0;
    for await (const _ of decoder.readChannel(ref as TelemetryFileRef, 'Lap')) {
      lidas += 1;
    }

    expect(lidas).toBe(meta.sampleCount);
  });

  it('LapDistPct fica em [0, 1] — a prova de que o offset está certo', async () => {
    let minimo = Number.POSITIVE_INFINITY;
    let maximo = Number.NEGATIVE_INFINITY;
    for await (const valor of decoder.readChannel(ref as TelemetryFileRef, 'LapDistPct')) {
      minimo = Math.min(minimo, valor);
      maximo = Math.max(maximo, valor);
    }

    // Um byte de deslocamento no offset transformaria isto em lixo na hora.
    expect(minimo).toBeGreaterThanOrEqual(0);
    expect(maximo).toBeLessThanOrEqual(1);
    expect(maximo).toBeGreaterThan(0.9);
  });

  it('o número da volta só cresce ao longo da gravação', async () => {
    let anterior = Number.NEGATIVE_INFINITY;
    let sempreCrescente = true;
    for await (const volta of decoder.readChannel(ref as TelemetryFileRef, 'Lap')) {
      if (volta < anterior) sempreCrescente = false;
      anterior = volta;
    }

    expect(sempreCrescente).toBe(true);
  });

  it('recorta as voltas e bate com o tempo que o próprio sim gravou', async () => {
    const alvo = ref as TelemetryFileRef;
    const meta = await decoder.readMetadata(alvo);
    const colher = async (canal: string): Promise<number[]> => {
      const valores: number[] = [];
      for await (const valor of decoder.readChannel(alvo, canal)) valores.push(valor);
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

  it('canal inexistente falha dizendo o nome', async () => {
    await expect(async () => {
      for await (const _ of decoder.readChannel(ref as TelemetryFileRef, 'CanalInventado')) {
        // não chega aqui
      }
    }).rejects.toThrow(/CanalInventado/);
  });
});
