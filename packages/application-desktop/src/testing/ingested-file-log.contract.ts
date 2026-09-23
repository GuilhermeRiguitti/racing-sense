import { toSessionId } from '@telemetry/domain';
import { describe, expect, it } from 'vitest';
import type {
  IngestedFileLogReaderPort,
  IngestedFileLogWriterPort,
} from '../ports/ingested-file-log.port.js';

export interface IngestedFileLogUnderTest {
  readonly reader: IngestedFileLogReaderPort;
  readonly writer: IngestedFileLogWriterPort;
}

/** Contrato do registro de arquivos ingeridos. Toda implementação roda isto. */
export function describeIngestedFileLogContract(
  name: string,
  createLog: () => IngestedFileLogUnderTest,
): void {
  describe(`${name} cumpre o contrato de IngestedFileLog`, () => {
    const locator = 'C:\\Users\\piloto\\Documents\\iRacing\\telemetry\\sessao.ibt';
    const sessionId = toSessionId('session-1');

    it('devolve a sessão do arquivo registrado', async () => {
      const { reader, writer } = createLog();

      await writer.record(locator, sessionId);

      await expect(reader.findSessionByLocator(locator)).resolves.toBe(sessionId);
    });

    it('devolve null para arquivo nunca ingerido', async () => {
      const { reader } = createLog();

      await expect(reader.findSessionByLocator(locator)).resolves.toBeNull();
    });

    it('registrar o mesmo arquivo de novo atualiza, não duplica', async () => {
      const { reader, writer } = createLog();

      await writer.record(locator, sessionId);
      await writer.record(locator, toSessionId('session-2'));

      await expect(reader.findSessionByLocator(locator)).resolves.toBe('session-2');
    });

    it('esquecer a sessão libera o arquivo para ser ingerido de novo', async () => {
      const { reader, writer } = createLog();

      await writer.record(locator, sessionId);
      await writer.forgetSession(sessionId);

      await expect(reader.findSessionByLocator(locator)).resolves.toBeNull();
    });

    it('caminho é comparado como está: duas grafias diferentes são dois arquivos', async () => {
      const { reader, writer } = createLog();

      await writer.record(locator, sessionId);

      // Normalizar caminho é responsabilidade de quem chama, não do registro —
      // aqui a comparação é literal, e isso precisa estar claro.
      await expect(reader.findSessionByLocator(locator.toLowerCase())).resolves.toBeNull();
    });
  });
}
