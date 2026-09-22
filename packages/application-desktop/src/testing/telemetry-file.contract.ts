import { describe, expect, it } from 'vitest';
import type { TelemetryFilePort } from '../ports/telemetry-file.port.js';

export interface TelemetryFileUnderTest {
  readonly port: TelemetryFilePort;
  /** Onde o adapter deixou os bytes pedidos, no vocabulário dele. */
  readonly locator: string;
}

/**
 * Contrato da porta de arquivo. Toda implementação roda isto — a de disco hoje,
 * a de memória compartilhada na fase 2.
 *
 * `materialize` recebe bytes e devolve uma origem que o adapter sabe abrir: um
 * arquivo temporário no de disco, um bloco em memória no de teste.
 */
export function describeTelemetryFileContract(
  name: string,
  materialize: (bytes: Uint8Array) => Promise<TelemetryFileUnderTest>,
): void {
  describe(`${name} cumpre o contrato de TelemetryFile`, () => {
    const conteudo = Uint8Array.from({ length: 64 }, (_, i) => i);

    it('lê exatamente os bytes pedidos, na posição pedida', async () => {
      const { port, locator } = await materialize(conteudo);
      const ref = await port.open(locator);

      expect(ref.sizeBytes).toBe(64);
      expect(Array.from(await port.read(ref, 10, 4))).toEqual([10, 11, 12, 13]);
      await port.close(ref);
    });

    it('leitura além do fim falha em vez de devolver pedaço', async () => {
      // Regra 23: buffer parcial vira amostra corrompida longe da causa.
      const { port, locator } = await materialize(conteudo);
      const ref = await port.open(locator);

      await expect(port.read(ref, 60, 8)).rejects.toThrow();
      await port.close(ref);
    });

    it('duas aberturas do mesmo arquivo não interferem entre si', async () => {
      // A ingestão e a importação de uma volta de referência podem abrir o mesmo
      // `.ibt` ao mesmo tempo. Fechar um não pode derrubar a leitura do outro.
      const { port, locator } = await materialize(conteudo);
      const primeira = await port.open(locator);
      const segunda = await port.open(locator);

      await port.close(primeira);

      expect(Array.from(await port.read(segunda, 0, 2))).toEqual([0, 1]);
      await port.close(segunda);
    });

    it('depois de fechar todas as aberturas, ler falha', async () => {
      const { port, locator } = await materialize(conteudo);
      const primeira = await port.open(locator);
      const segunda = await port.open(locator);

      await port.close(primeira);
      await port.close(segunda);

      await expect(port.read(segunda, 0, 2)).rejects.toThrow();
    });

    it('fechar duas vezes a mesma abertura não fecha a de outro', async () => {
      // Fechar é idempotente por abertura: um `close` repetido num `finally`
      // não pode consumir a abertura de outra parte do sistema.
      const { port, locator } = await materialize(conteudo);
      const minha = await port.open(locator);
      const alheia = await port.open(locator);

      await port.close(minha);
      await port.close(minha);

      expect(Array.from(await port.read(alheia, 0, 1))).toEqual([0]);
      await port.close(alheia);
    });
  });
}
