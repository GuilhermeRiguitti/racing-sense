import type {
  IngestedFileLogReaderPort,
  IngestedFileLogWriterPort,
} from '@telemetry/application-desktop';
import type { SessionId } from '@telemetry/domain';

export function createInMemoryIngestedFileLog(): IngestedFileLogReaderPort &
  IngestedFileLogWriterPort {
  const byLocator = new Map<string, SessionId>();

  return {
    async findSessionByLocator(locator: string) {
      return byLocator.get(locator) ?? null;
    },

    async record(locator: string, sessionId: SessionId) {
      byLocator.set(locator, sessionId);
    },

    async forgetSession(sessionId: SessionId) {
      for (const [locator, stored] of byLocator) {
        if (stored === sessionId) {
          byLocator.delete(locator);
        }
      }
    },
  };
}
