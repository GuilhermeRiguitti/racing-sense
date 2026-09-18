import type { IdGeneratorPort } from '@telemetry/application';
import {
  NotImplementedError,
  toAnalysisReportId,
  toReferenceLapId,
  toSessionId,
} from '@telemetry/domain';
import { aSession } from '@telemetry/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import type { EventPublisherPort } from '../ports/event-publisher.port.js';
import type { PublicationQueuePort } from '../ports/publication.port.js';
import type { SessionWriterPort } from '../ports/session-store.port.js';
import type { DecodedMetadata, TelemetryDecoderPort } from '../ports/telemetry-decoder.port.js';
import type { TelemetryFilePort, TelemetryFileRef } from '../ports/telemetry-file.port.js';
import { MissingChannelError } from '../shared/errors.js';
import { createIngestTelemetryFileHandler } from './ingest-telemetry-file.command.js';

const ref: TelemetryFileRef = { locator: '/telemetry/sessao.ibt', sizeBytes: 1024 };

const channel = (name: string) => ({
  name,
  description: name,
  unit: '',
  type: 'number' as const,
  valuesPerSample: 1,
});

const metadataWith = (channels: readonly string[]): DecodedMetadata => {
  const { id: _id, tickRate: _t, sampleCount: _s, channels: _c, ...session } = aSession();
  return {
    tickRate: 60,
    sampleCount: 120,
    channels: channels.map(channel),
    session,
  };
};

const ids: IdGeneratorPort = {
  nextSessionId: () => toSessionId('session-1'),
  nextReferenceLapId: () => toReferenceLapId('reference-1'),
  nextAnalysisReportId: () => toAnalysisReportId('report-1'),
};

const eventos = (): EventPublisherPort => ({ publish: vi.fn() });

const publicationQueue = (): PublicationQueuePort => ({
  enqueue: vi.fn(async () => undefined),
  pending: async () => [],
  markPublished: async () => undefined,
  markFailed: async () => undefined,
});

async function* numbers(values: readonly number[]): AsyncIterable<number> {
  for (const value of values) {
    yield value;
  }
}

function filePort(): TelemetryFilePort & { close: ReturnType<typeof vi.fn> } {
  const close = vi.fn(async () => undefined);
  return {
    open: async () => ref,
    read: async () => new Uint8Array(),
    close,
  };
}

describe('IngestTelemetryFile', () => {
  it('recusa arquivo sem os canais necessários, nomeando o que falta', async () => {
    const files = filePort();
    const decoder: TelemetryDecoderPort = {
      readMetadata: async () => metadataWith(['Speed']),
      readChannel: () => numbers([]),
    };
    const sessions: SessionWriterPort = { save: vi.fn(), delete: vi.fn() };

    const events = eventos();
    const handle = createIngestTelemetryFileHandler({
      files,
      decoder,
      sessions,
      ids,
      publicationQueue: publicationQueue(),
      events,
    });

    await expect(handle({ locator: ref.locator })).rejects.toThrow(MissingChannelError);
    expect(events.publish).not.toHaveBeenCalled();
    await expect(handle({ locator: ref.locator })).rejects.toThrow(/LapDistPct/);
    expect(sessions.save).not.toHaveBeenCalled();
  });

  it('fecha o arquivo mesmo quando a ingestão falha', async () => {
    const files = filePort();
    const decoder: TelemetryDecoderPort = {
      readMetadata: async () => metadataWith(['Lap', 'LapDistPct']),
      readChannel: () => numbers([0, 0.5, 1]),
    };

    const events = eventos();
    const handle = createIngestTelemetryFileHandler({
      files,
      decoder,
      sessions: { save: vi.fn(), delete: vi.fn() },
      ids,
      publicationQueue: publicationQueue(),
      events,
    });

    // O recorte de voltas ainda é stub — a falha vem do domínio.
    await expect(handle({ locator: ref.locator })).rejects.toThrow(NotImplementedError);
    expect(files.close).toHaveBeenCalledWith(ref);
    // Ingestão que falhou não anuncia sessão nova: evento é fato consumado.
    expect(events.publish).not.toHaveBeenCalled();
  });
});
