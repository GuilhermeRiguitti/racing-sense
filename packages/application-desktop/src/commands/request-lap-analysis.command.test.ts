import { InvariantError, NotFoundError, toReferenceLapId, toSessionId } from '@telemetry/domain';
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
  it('o narrador recebe o delta já calculado, e o relatório é gravado', async () => {
    const narrator: NarratorPort = {
      narrate: vi.fn(async () => ({ summary: 'Resumo', findings: [], model: 'fake' })),
    };
    const reports: AnalysisReportWriterPort = { save: vi.fn() };
    const events = eventos();
    // Volta de 3 amostras, 3 ticks mais lenta que a referência de mesma forma.
    const volta = aLap({ number: 3, startSample: 0, endSample: 2, lapTimeSeconds: 6 / 60 });
    const regua = aReferenceLap({
      lap: aLap({ startSample: 0, endSample: 2, lapTimeSeconds: 3 / 60 }),
    });

    const handle = createRequestLapAnalysisHandler({
      sessions: sessionsReading({ listLaps: async () => [volta] }),
      referenceLaps: referencesReading({ findById: async () => regua }),
      reports,
      narrator,
      clock: { now: () => new Date('2026-09-17T12:00:00Z') },
      events,
    });

    await handle(command);

    const [pedido] = vi.mocked(narrator.narrate).mock.calls[0] ?? [];
    expect(pedido?.comparison.totalDeltaSeconds).toBeCloseTo(3 / 60, 12);
    expect(pedido?.comparison.deltaSeries.x).toEqual([0, 0.5, 1]);
    expect(reports.save).toHaveBeenCalledOnce();
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'analysis-ready', lapNumber: 3 }),
    );
  });

  it('delta que não fecha não chega ao narrador', async () => {
    const narrator: NarratorPort = { narrate: vi.fn() };
    const reports: AnalysisReportWriterPort = { save: vi.fn() };
    const events = eventos();

    const handle = createRequestLapAnalysisHandler({
      // A volta diz 4501 amostras; a série gravada tem 3. Falha no domínio.
      sessions: sessionsReading(),
      referenceLaps: referencesReading(),
      reports,
      narrator,
      clock: { now: () => new Date('2026-09-17T12:00:00Z') },
      events,
    });

    await expect(handle(command)).rejects.toThrow(InvariantError);
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
