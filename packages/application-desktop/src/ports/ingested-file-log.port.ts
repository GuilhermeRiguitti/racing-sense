import type { SessionId } from '@telemetry/domain';

/**
 * Registro de quais arquivos já foram ingeridos.
 *
 * Existe por um motivo concreto: o watcher enxerga a pasta inteira ao abrir o
 * aplicativo, inclusive os arquivos de ontem. Sem este registro, cada abertura
 * reprocessaria tudo e duplicaria sessão.
 *
 * ## Por que não guardar o caminho dentro da sessão
 *
 * Seria mais simples, e vazaria: o caminho é `C:\Users\<nome>\Documents\...` —
 * tem o nome de usuário do Windows dentro. A sessão é publicada na nuvem
 * (ADR 0013); este registro **nunca** sai da máquina. Separar os dois é o que
 * garante que um caminho local não viaje junto com a volta compartilhada.
 */
export interface IngestedFileLogReaderPort {
  /** Sessão gerada por este arquivo, ou `null` se ele nunca foi ingerido. */
  findSessionByLocator(locator: string): Promise<SessionId | null>;
}

export interface IngestedFileLogWriterPort {
  record(locator: string, sessionId: SessionId): Promise<void>;
  /** Some com o registro quando a sessão é apagada, para o arquivo poder voltar. */
  forgetSession(sessionId: SessionId): Promise<void>;
}
