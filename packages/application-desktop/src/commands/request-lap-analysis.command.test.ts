import {
  NotFoundError,
  NotImplementedError,
  toReferenceLapId,
  toSessionId,
} from '@telemetry/domain';
import { aLap, aReferenceLap, aSeries, aSession } from '@telemetry/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisReportWriterPort } from '../ports/analysis-report-store.port.js';
import type { EventPublisherPort } from '../ports/event-publisher.port.js';
import type { NarratorPort } from '../ports/narrator.port.js';
import type { ReferenceLapReaderPort } from '../ports/reference-lap-store.port.js';
import type { SessionReaderPort } from '../ports/session-store.port.js';
import { createRequestLapAnalysisHandler } from './request-lap-analysis.command.js';

const session = aSession();
const reference = aReferenceLap();

const sessionsReading = (overrides: Partial<SessionReaderPort> = {}): SessionReaderPort => ({
  list: async () => [session],
  findById: async () => session,
  listLaps: async () => [aLap({ number: 3 })],
  readLapSeries: async () => [aSeries()],
  ...overrides,
});

const referencesReading = (
  overrides: Partial<ReferenceLapReaderPort> = {},
): ReferenceLapReaderPort => ({
  list: async () => [reference],
  findById: async () => reference,
  ...overrides,
});

const eventos = (): EventPublisherPort => ({ publish: vi.fn() });

const command = {
  sessionId: session.id,
  lapNumber: 3,
  referenceLapId: reference.id,
};

describe('RequestLapAnalysis, só volta válida (ADR 0018)', () => {
  it('recusa volta com saída de pista, nomeando o motivo', async () => {
    const narrator: NarratorPort = { narrate: vi.fn() };
    const handle = createRequestLapAnalysisHandler({
      sessions: sessionsReading({
        listLaps: async () => [aLap({ number: 3, flags: ['off-track'] })],
      }),
      referenceLaps: referencesReading(),
      reports: { save: vi.fn() } as AnalysisReportWriterPort,
      narrator,
      clock: { now: () => new Date() },
      events: eventos(),
    });

    await expect(handle(command)).rejects.toThrow(/off-track/);
    // Recusa antes de gastar chamada de modelo.
    expect(narrator.narrate).not.toHaveBeenCalled();
  });

  it('recusa volta cortada pela gravação', async () => {
    const handle = createRequestLapAnalysisHandler({
      sessions: sessionsReading({
        listLaps: async () => [aLap({ number: 3, flags: ['incomplete'], lapTimeSeconds: null })],
      }),
      referenceLaps: referencesReading(),
      reports: { save: vi.fn() } as AnalysisReportWriterPort,
      narrator: { narrate: vi.fn() },
      clock: { now: () => new Date() },
      events: eventos(),
    });

    await expect(handle(command)).rejects.toThrow(/incomplete/);
  });
});

describe('RequestLapAnalysis', () => {
  it('não chama o narrador antes de o delta estar calculado', async () => {
    const narrator: NarratorPort = { narrate: vi.fn() };
    const reports: AnalysisReportWriterPort = { save: vi.fn() };
    const events = eventos();

    const handle = createRequestLapAnalysisHandler({
      sessions: sessionsReading(),
      referenceLaps: referencesReading(),
      reports,
      narrator,
      clock: { now: () => new Date('2026-09-17T12:00:00Z') },
      events,
    });

    // O cálculo do delta ainda é stub; o ponto do teste é que a falha acontece
    // no domínio, e o modelo não é chamado sem número pronto na mão.
    await expect(handle(command)).rejects.toThrow(NotImplementedError);
    expect(narrator.narrate).not.toHaveBeenCalled();
    expect(reports.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('falha cedo quando a sessão não existe', async () => {
    const narrator: NarratorPort = { narrate: vi.fn() };

    const handle = createRequestLapAnalysisHandler({
      sessions: sessionsReading({ findById: async () => null }),
      referenceLaps: referencesReading(),
      reports: { save: vi.fn() },
      narrator,
      clock: { now: () => new Date() },
      events: eventos(),
    });

    await expect(handle({ ...command, sessionId: toSessionId('sumiu') })).rejects.toThrow(
      NotFoundError,
    );
    expect(narrator.narrate).not.toHaveBeenCalled();
  });

  it('falha cedo quando a referência não existe', async () => {
    const handle = createRequestLapAnalysisHandler({
      sessions: sessionsReading(),
      referenceLaps: referencesReading({ findById: async () => null }),
      reports: { save: vi.fn() },
      narrator: { narrate: vi.fn() },
      clock: { now: () => new Date() },
      events: eventos(),
    });

    await expect(handle({ ...command, referenceLapId: toReferenceLapId('sumiu') })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('falha quando a volta pedida não existe na sessão', async () => {
    const handle = createRequestLapAnalysisHandler({
      sessions: sessionsReading({ listLaps: async () => [aLap({ number: 1 })] }),
      referenceLaps: referencesReading(),
      reports: { save: vi.fn() },
      narrator: { narrate: vi.fn() },
      clock: { now: () => new Date() },
      events: eventos(),
    });

    await expect(handle({ ...command, lapNumber: 42 })).rejects.toThrow(NotFoundError);
  });
});
