import { createFileTelemetrySource } from '@telemetry/adapter-fs';
import { createIbtTelemetryDecoder } from '@telemetry/adapter-ibt';
import type { TelemetryFileRef } from '@telemetry/application-desktop';
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

  it('canal inexistente falha dizendo o nome', async () => {
    await expect(async () => {
      for await (const _ of decoder.readChannel(ref as TelemetryFileRef, 'CanalInventado')) {
        // não chega aqui
      }
    }).rejects.toThrow(/CanalInventado/);
  });
});
