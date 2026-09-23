import {
  describeReferenceLapStoreContract,
  describeSessionStoreContract,
} from '@telemetry/application-desktop/testing';
import { createInMemoryReferenceLapStore } from './reference-lap-store.memory.js';
import { createInMemorySessionStore } from './session-store.memory.js';

/**
 * Nenhum teste escrito à mão aqui: o adapter roda a suíte de contrato da porta.
 * Quando o adapter de disco existir, ele roda exatamente esta mesma suíte — é
 * assim que se sabe que um pode substituir o outro.
 */
describeSessionStoreContract('InMemorySessionStore', () => {
  const store = createInMemorySessionStore();
  return { reader: store, writer: store };
});

describeReferenceLapStoreContract('InMemoryReferenceLapStore', () => {
  const store = createInMemoryReferenceLapStore();
  return { reader: store, writer: store };
});
