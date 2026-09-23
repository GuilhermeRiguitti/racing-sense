import { describePublishedSessionStoreContract } from '@telemetry/application-cloud/testing';
import { describeIngestedFileLogContract } from '@telemetry/application-desktop/testing';
import { createInMemoryIngestedFileLog } from './ingested-file-log.memory.js';
import { createInMemoryPublishedSessionStore } from './published-session-store.memory.js';

describePublishedSessionStoreContract('InMemoryPublishedSessionStore', () => {
  const store = createInMemoryPublishedSessionStore();
  return { reader: store, writer: store };
});

describeIngestedFileLogContract('InMemoryIngestedFileLog', () => {
  const log = createInMemoryIngestedFileLog();
  return { reader: log, writer: log };
});
