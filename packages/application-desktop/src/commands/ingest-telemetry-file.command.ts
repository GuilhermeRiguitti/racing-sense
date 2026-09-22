import type { IdGeneratorPort } from '@telemetry/application';
import {
  type ChannelSeries,
  createChannelSeries,
  detectLaps,
  type Lap,
  type SessionId,
  type TelemetrySession,
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
export const OPTIONAL_LAP_CHANNELS = ['OnPitRoad', 'PlayerTrackSurface'] as const;

/**
 * Código do iRacing para "fora dos limites da pista" em `PlayerTrackSurface`.
 *
 * O vocabulário do sim para aqui: o domínio recebe booleano, não código.
 */
const SURFACE_OFF_TRACK = 0;

/**
 * Canais que viram série gravada por volta.
 *
 * Os seis que respondem "onde perdi tempo". Não são todos os 288 porque ainda não
 * há análise que use os outros — guardar sem uso é custo sem retorno.
 *
 * **Para a análise de setup, basta acrescentar nomes aqui.** Nada mais muda: o
 * tipo de cada canal vem do arquivo (contínuo ou discreto), a gravação escolhe a
 * largura exata pelo próprio dado, e a reamostragem sabe não interpolar o que é
 * discreto. Canal ausente é ignorado, não é erro: o conjunto muda entre carros.
 */
export const ANALYSIS_CHANNELS = [
  'Speed',
  'Throttle',
  'Brake',
  'Gear',
  'RPM',
  'SteeringWheelAngle',
] as const;

/*
 * Não existe grade de distância na gravação, de propósito (ADR 0019).
 *
 * A versão anterior reamostrava cada volta numa grade de um ponto por metro, com
 * 4500 m como comprimento "típico" quando o arquivo não informava. Os dois
 * números eram escolha minha, e a grade custava dado: a velocidade mínima de uma
 * volta real voltava 0,03 km/h errada porque o ponto da grade não caía em cima
 * da amostra mais lenta — um erro que muda conforme onde o piloto freou.
 *
 * O que se grava é a amostra como o arquivo entregou, com a posição medida de
 * cada uma. Reamostrar é trabalho de quem compara duas voltas, na hora.
 */

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

      const [lapNumber, lapDistPct, onPitRoad, trackSurface] = await Promise.all([
        collectChannel(deps.decoder.readChannel(ref, 'Lap')),
        collectChannel(deps.decoder.readChannel(ref, 'LapDistPct')),
        opcional('OnPitRoad'),
        opcional('PlayerTrackSurface'),
      ]);

      const laps: readonly Lap[] = detectLaps({
        tickRate: metadata.tickRate,
        lapNumber,
        lapDistPct,
        ...(onPitRoad !== undefined ? { onPitRoad: onPitRoad.map((v) => v !== 0) } : {}),
        ...(trackSurface !== undefined
          ? { offTrack: trackSurface.map((v) => v === SURFACE_OFF_TRACK) }
          : {}),
      });

      const session: TelemetrySession = {
        ...metadata.session,
        id: deps.ids.nextSessionId(),
        tickRate: metadata.tickRate,
        sampleCount: metadata.sampleCount,
        channels: metadata.channels,
      };

      // A amostra bruta de cada canal, com a posição medida dela na pista. Nada
      // é reamostrado nem interpolado aqui: o que o banco guarda é o que o
      // arquivo disse.
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
          const descritor = metadata.channels.find((canal) => canal.name === name);
          if (descritor === undefined) continue;
          series.push(
            createChannelSeries({
              channel: name,
              unit: descritor.unit,
              type: descritor.type,
              axis: 'lapDistPct',
              x: posicoes,
              y: valores.slice(lap.startSample, lap.endSample + 1),
            }),
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
