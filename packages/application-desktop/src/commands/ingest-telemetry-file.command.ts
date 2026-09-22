import type { IdGeneratorPort } from '@telemetry/application';
import {
  type ChannelSeries,
  createChannelSeries,
  detectLaps,
  type Lap,
  type SessionId,
  type TelemetrySession,
  toDistanceSeries,
} from '@telemetry/domain';
import type { EventPublisherPort } from '../ports/event-publisher.port.js';
import type {
  IngestedFileLogReaderPort,
  IngestedFileLogWriterPort,
} from '../ports/ingested-file-log.port.js';
import type { PublicationQueuePort } from '../ports/publication.port.js';
import type { SessionWriterPort } from '../ports/session-store.port.js';
import type { TelemetryDecoderPort } from '../ports/telemetry-decoder.port.js';
import type { TelemetryFilePort } from '../ports/telemetry-file.port.js';
import { collectChannel } from '../shared/collect-channel.js';
import { MissingChannelError } from '../shared/errors.js';

/**
 * Canais exigidos para recortar voltas.
 *
 * Isto **não** é catálogo fixo de telemetria: o catálogo continua vindo do
 * arquivo, em runtime. São os poucos canais sem os quais o recorte de voltas é
 * impossível. A presença é verificada contra o catálogo real e a ausência falha
 * com o nome do canal — em vez de produzir volta errada em silêncio.
 */
export const REQUIRED_LAP_CHANNELS = ['Lap', 'LapDistPct'] as const;

/**
 * Canais que melhoram o recorte quando existem, e cuja ausência não impede nada.
 *
 * Separados dos obrigatórios de propósito: sem eles a volta ainda é recortada,
 * só não dá para dizer se ela passou pela box ou saiu da pista. Exigi-los seria
 * recusar arquivo por causa de informação acessória.
 */
export const OPTIONAL_LAP_CHANNELS = [
  'OnPitRoad',
  'PlayerTrackSurface',
  'PlayerCarMyIncidentCount',
] as const;

/**
 * Código do iRacing para "fora dos limites da pista" em `PlayerTrackSurface`.
 *
 * O vocabulário do sim para aqui: o domínio recebe booleano, não código.
 */
const SURFACE_OFF_TRACK = 0;

/**
 * Canais que viram série gravada por volta.
 *
 * Não são todos: um arquivo tem quase 300 canais, e guardar todos por volta
 * multiplicaria o banco por dez para mostrar dado que ninguém abre. Estes são os
 * que respondem "onde perdi tempo" — o resto continua no `.ibt`, que não é
 * descartado, e pode ser relido quando fizer falta (ADR 0007).
 *
 * Canal ausente é ignorado, não é erro: o conjunto muda entre carros.
 */
export const ANALYSIS_CHANNELS = [
  'Speed',
  'Throttle',
  'Brake',
  'Gear',
  'RPM',
  'SteeringWheelAngle',
] as const;

/**
 * Espaçamento da grade de distância, em metros.
 *
 * Um ponto por metro. O número **não** é fixo por volta de propósito: a 60 Hz um
 * GT3 gera uma amostra a cada 0,2 a 1,2 m, então uma grade de mil pontos jogaria
 * fora seis a oito vezes a resolução do dado bruto — e resolução é exatamente o
 * que faz sentido a frase "você freou 12 m mais tarde". Por metro, a grade fica
 * perto do dado original em toda a volta, e igual em qualquer pista.
 *
 * A redução para desenhar acontece depois, na hora de mostrar (ADR 0007).
 */
const SERIES_METERS_PER_POINT = 1;

/** Quando o arquivo não informa o comprimento da pista. Um traçado mediano. */
const FALLBACK_TRACK_METERS = 4500;

export interface IngestTelemetryFileCommand {
  /** Onde o arquivo está, no vocabulário do adapter (caminho, chave...). */
  readonly locator: string;
}

export interface IngestTelemetryFileDeps {
  readonly files: TelemetryFilePort;
  readonly decoder: TelemetryDecoderPort;
  readonly sessions: SessionWriterPort;
  readonly ids: IdGeneratorPort;
  /** Fila de publicação. Enfileirar é local e instantâneo; enviar é outro caso de uso. */
  readonly publicationQueue: PublicationQueuePort;
  /** Avisa a interface que chegou sessão nova, para ela não esperar recarregar. */
  readonly events: EventPublisherPort;
  /**
   * Quais arquivos já viraram sessão.
   *
   * O watcher enxerga a pasta inteira ao abrir o aplicativo, inclusive o que já
   * foi lido ontem — sem este registro, cada abertura duplicaria tudo.
   */
  readonly ingestedFiles: IngestedFileLogReaderPort & IngestedFileLogWriterPort;
}

export type IngestTelemetryFileHandler = (
  command: IngestTelemetryFileCommand,
) => Promise<SessionId>;

/**
 * Ingere um arquivo de telemetria e guarda a sessão com as voltas recortadas.
 *
 * Comando: muda estado e devolve só o identificador do que foi criado.
 *
 * **Idempotente por arquivo.** Chamar de novo com o mesmo caminho devolve a
 * sessão que já existe, sem reabrir nada e sem anunciar evento — é o que
 * permite o watcher varrer a pasta inteira toda vez que o aplicativo abre.
 */
export function createIngestTelemetryFileHandler(
  deps: IngestTelemetryFileDeps,
): IngestTelemetryFileHandler {
  return async ({ locator }) => {
    // Idempotência primeiro, antes de abrir arquivo: reprocessar custa segundos
    // de CPU e produziria uma sessão duplicada na tela do piloto.
    const alreadyIngested = await deps.ingestedFiles.findSessionByLocator(locator);
    if (alreadyIngested !== null) {
      return alreadyIngested;
    }

    const ref = await deps.files.open(locator);
    try {
      const metadata = await deps.decoder.readMetadata(ref);

      const available = new Set(metadata.channels.map((channel) => channel.name));
      const missing = REQUIRED_LAP_CHANNELS.filter((name) => !available.has(name));
      if (missing.length > 0) {
        throw new MissingChannelError(
          `Arquivo sem os canais necessários para recortar voltas: ${missing.join(', ')}`,
        );
      }

      const opcional = async (name: string): Promise<number[] | undefined> =>
        available.has(name) ? collectChannel(deps.decoder.readChannel(ref, name)) : undefined;

      const [lapNumber, lapDistPct, onPitRoad, trackSurface, incidentCount] = await Promise.all([
        collectChannel(deps.decoder.readChannel(ref, 'Lap')),
        collectChannel(deps.decoder.readChannel(ref, 'LapDistPct')),
        opcional('OnPitRoad'),
        opcional('PlayerTrackSurface'),
        opcional('PlayerCarMyIncidentCount'),
      ]);

      const trackLengthMeters = metadata.session.track.lengthMeters ?? FALLBACK_TRACK_METERS;

      const laps: readonly Lap[] = detectLaps({
        tickRate: metadata.tickRate,
        lapNumber,
        lapDistPct,
        trackLengthMeters,
        ...(onPitRoad !== undefined ? { onPitRoad: onPitRoad.map((v) => v !== 0) } : {}),
        ...(trackSurface !== undefined
          ? { offTrack: trackSurface.map((v) => v === SURFACE_OFF_TRACK) }
          : {}),
        ...(incidentCount !== undefined ? { incidentCount } : {}),
      });

      const session: TelemetrySession = {
        ...metadata.session,
        id: deps.ids.nextSessionId(),
        tickRate: metadata.tickRate,
        sampleCount: metadata.sampleCount,
        channels: metadata.channels,
      };

      // Série por distância, e não por tempo: é o que torna duas voltas
      // somáveis ponto a ponto, independente de quem freou mais tarde.
      const canaisDeAnalise = ANALYSIS_CHANNELS.filter((name) => available.has(name));
      const valoresPorCanal = new Map<string, readonly number[]>(
        await Promise.all(
          canaisDeAnalise.map(
            async (name) =>
              [name, await collectChannel(deps.decoder.readChannel(ref, name))] as const,
          ),
        ),
      );

      const seriesByLap = new Map<number, readonly ChannelSeries[]>();
      for (const lap of laps) {
        const posicoes = lapDistPct.slice(lap.startSample, lap.endSample + 1);
        const series: ChannelSeries[] = [];
        for (const [name, valores] of valoresPorCanal) {
          const trecho = valores.slice(lap.startSample, lap.endSample + 1);
          const unidade = metadata.channels.find((canal) => canal.name === name)?.unit ?? '';
          series.push(
            toDistanceSeries(
              createChannelSeries({
                channel: name,
                unit: unidade,
                axis: 'time',
                x: trecho.map((_, i) => i / metadata.tickRate),
                y: trecho,
              }),
              posicoes,
              Math.round(trackLengthMeters / SERIES_METERS_PER_POINT),
            ),
          );
        }
        seriesByLap.set(lap.number, series);
      }

      await deps.sessions.save({ session, laps, seriesByLap });
      await deps.ingestedFiles.record(locator, session.id);

      // Publica tudo automaticamente, mas só enfileirando: a ingestão não espera
      // rede, e a sessão nasce privada no servidor (ADR 0013).
      await deps.publicationQueue.enqueue(session.id);

      // Só depois de tudo gravado: evento anunciando o que já é verdade, nunca
      // o que está a caminho.
      deps.events.publish({
        type: 'session-ingested',
        sessionId: session.id,
        lapCount: laps.length,
      });

      return session.id;
    } finally {
      await deps.files.close(ref);
    }
  };
}
