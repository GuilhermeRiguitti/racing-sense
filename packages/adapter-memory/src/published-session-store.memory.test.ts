import { describePublishedSessionStoreContract } from '@telemetry/application-cloud/testing';
import { createInMemoryPublishedSessionStore } from './published-session-store.memory.js';

describePublishedSessionStoreContract('InMemoryPublishedSessionStore', () => {
  const store = createInMemoryPublishedSessionStore();
  return { reader: store, writer: store };
});
