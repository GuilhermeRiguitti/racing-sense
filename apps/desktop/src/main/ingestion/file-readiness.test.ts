import { describe, expect, it, vi } from 'vitest';
import { type ReadinessOptions, type ReadinessProbe, waitUntilReadable } from './file-readiness.js';

const options: ReadinessOptions = { stableChecks: 2, pollIntervalMs: 10, timeoutMs: 1_000 };

/**
 * Sonda falsa: tamanhos roteirizados e relógio que anda sozinho a cada espera.
 * Sem disco e sem timer — o teste roda em milissegundos e nunca fica instável.
 */
function probeWith(config: {
  sizes: readonly (number | Error)[];
  openFails?: number;
  openError?: NodeJS.ErrnoException;
}): ReadinessProbe & { openAttempts: () => number } {
  let index = 0;
  let clock = 0;
  let openAttempts = 0;
  const openFails = config.openFails ?? 0;

  return {
    async size() {
      const next = config.sizes[Math.min(index, config.sizes.length - 1)] ?? 0;
      index += 1;
      if (next instanceof Error) throw next;
      return next;
    },
    async openForRead() {
      openAttempts += 1;
      if (openAttempts <= openFails) {
        throw config.openError ?? Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
      }
    },
    async wait(ms) {
      clock += ms;
    },
    now() {
      return clock;
    },
    openAttempts: () => openAttempts,
  };
}

describe('waitUntilReadable', () => {
  it('libera quando o arquivo para de crescer', async () => {
    const probe = probeWith({ sizes: [1024, 4096, 8192, 8192, 8192] });

    await expect(waitUntilReadable('sessao.ibt', probe, options)).resolves.toEqual({
      ready: true,
      sizeBytes: 8192,
    });
  });

  it('não confunde arquivo vazio com arquivo pronto', async () => {
    // Zero byte estável é o sim tendo criado o arquivo e ainda não escrito nada.
    const probe = probeWith({ sizes: [0] });

    const resultado = await waitUntilReadable('sessao.ibt', probe, options);

    expect(resultado).toMatchObject({ ready: false });
    expect(probe.openAttempts()).toBe(0);
  });

  it('insiste enquanto o Windows mantém o arquivo travado', async () => {
    const probe = probeWith({ sizes: [8192], openFails: 3 });

    await expect(waitUntilReadable('sessao.ibt', probe, options)).resolves.toMatchObject({
      ready: true,
    });
    expect(probe.openAttempts()).toBe(4);
  });

  it('erro de abertura que não é trava desiste na hora', async () => {
    const probe = probeWith({
      sizes: [8192],
      openFails: 1,
      openError: Object.assign(new Error('disco morreu'), { code: 'EIO' }),
    });

    const resultado = await waitUntilReadable('sessao.ibt', probe, options);

    expect(resultado).toMatchObject({ ready: false });
    expect(resultado).toHaveProperty('reason', expect.stringContaining('disco morreu'));
    // Insistir num erro que não é trava só atrasaria o inevitável.
    expect(probe.openAttempts()).toBe(1);
  });

  it('arquivo que nunca estabiliza vence por tempo, com o motivo', async () => {
    let size = 1000;
    const probe: ReadinessProbe = {
      size: async () => (size += 1000),
      openForRead: vi.fn(),
      wait: async () => undefined,
      now: (() => {
        let clock = 0;
        return () => (clock += 50);
      })(),
    };

    const resultado = await waitUntilReadable('sessao.ibt', probe, options);

    expect(resultado).toMatchObject({ ready: false });
    expect(resultado).toHaveProperty('reason', expect.stringContaining('não estabilizou'));
    expect(probe.openForRead).not.toHaveBeenCalled();
  });

  it('arquivo que some no meio não vira exceção', async () => {
    const probe = probeWith({
      sizes: [Object.assign(new Error('ENOENT: sumiu'), { code: 'ENOENT' })],
    });

    await expect(waitUntilReadable('sessao.ibt', probe, options)).resolves.toMatchObject({
      ready: false,
    });
  });
});
