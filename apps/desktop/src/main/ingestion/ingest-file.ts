import type { DesktopEvent } from '../../shared/ipc.js';
import type { LocalStore } from '../db/local-store.js';
import { type ChannelSeries, createChannelSeries } from '../domain/channel.js';
import { MissingChannelError, RepeatedLapNumberError } from '../domain/errors.js';
import type { SessionId } from '../domain/id.js';
import { toSessionId } from '../domain/id.js';
import type { Lap } from '../domain/lap.js';
import { detectLaps } from '../domain/lap-detection.js';
import type { TelemetrySession } from '../domain/session.js';
import { type IbtFile, openIbtFile } from '../ibt/ibt-file.js';

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

/** Código do iRacing para "carro fora do mundo do sim" (`irsdk_TrkLoc::NotInWorld`). */
const SURFACE_NOT_IN_WORLD = -1;

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

export interface IngestContext {
  readonly store: LocalStore;
  /** Avisa a interface que chegou sessão nova, para ela não esperar recarregar. */
  readonly emit: (event: DesktopEvent) => void;
  /** Como abrir o arquivo. Em produção, o disco; o teste passa um `.ibt` falso. */
  readonly open?: (path: string) => Promise<IbtFile>;
}

/**
 * Materializa um canal inteiro em memória.
 *
 * Só para os canais que o recorte e a gravação precisam por inteiro. Uma stint
 * de 30 min a 60 Hz passa de 100 mil pontos por canal.
 */
async function collect(values: AsyncIterable<number>): Promise<number[]> {
  const collected: number[] = [];
  for await (const value of values) {
    collected.push(value);
  }
  return collected;
}

/**
 * Ingere um `.ibt` e guarda a sessão com as voltas recortadas.
 *
 * **Idempotente por arquivo.** Chamar de novo com o mesmo caminho devolve a
 * sessão que já existe, sem reabrir nada e sem anunciar evento — é o que
 * permite o watcher varrer a pasta inteira toda vez que o aplicativo abre.
 */
export async function ingestTelemetryFile(ctx: IngestContext, path: string): Promise<SessionId> {
  const { store, emit, open = openIbtFile } = ctx;

  // Idempotência primeiro, antes de abrir arquivo: reprocessar custa segundos
  // de CPU e produziria uma sessão duplicada na tela do piloto.
  const alreadyIngested = store.findSessionByLocator(path);
  if (alreadyIngested !== null) {
    return alreadyIngested;
  }

  const file = await open(path);
  try {
    const metadata = await file.readMetadata();

    const available = new Set(metadata.channels.map((channel) => channel.name));
    const missing = REQUIRED_LAP_CHANNELS.filter((name) => !available.has(name));
    if (missing.length > 0) {
      throw new MissingChannelError(
        `Arquivo sem os canais necessários para recortar voltas: ${missing.join(', ')}`,
      );
    }

    const opcional = async (name: string): Promise<number[] | undefined> =>
      available.has(name) ? collect(file.readChannel(name)) : undefined;

    const [lapNumber, lapDistPct, onPitRoad, trackSurface] = await Promise.all([
      collect(file.readChannel('Lap')),
      collect(file.readChannel('LapDistPct')),
      opcional('OnPitRoad'),
      opcional('PlayerTrackSurface'),
    ]);

    const laps: readonly Lap[] = detectLaps({
      tickRate: metadata.tickRate,
      lapNumber,
      lapDistPct,
      ...(onPitRoad !== undefined ? { onPitRoad: onPitRoad.map((v) => v !== 0) } : {}),
      ...(trackSurface !== undefined
        ? {
            offTrack: trackSurface.map((v) => v === SURFACE_OFF_TRACK),
            inWorld: trackSurface.map((v) => v !== SURFACE_NOT_IN_WORLD),
          }
        : {}),
    });

    const repetidos = [
      ...new Set(laps.map((lap) => lap.number).filter((n, i, todos) => todos.indexOf(n) !== i)),
    ];
    if (repetidos.length > 0) {
      // O diagnóstico vai na mensagem: sem o arquivo em mãos, é o que diz se o
      // reinício foi troca de sessão do sim ou outra coisa.
      const sessoesDoSim = available.has('SessionNum')
        ? [...new Set(await collect(file.readChannel('SessionNum')))]
        : null;
      throw new RepeatedLapNumberError(
        `O contador de voltas do sim repetiu a volta ${repetidos.join(', ')} neste arquivo. ` +
          (sessoesDoSim === null
            ? 'O arquivo não tem o canal SessionNum para dizer por quê.'
            : `Sessões do sim no arquivo (SessionNum): ${sessoesDoSim.join(', ')}.`) +
          ` Voltas recortadas: ${laps.map((lap) => lap.number).join(' ')}.`,
      );
    }

    // Id aleatório, não contador: o banco é persistente e a gravação é upsert —
    // um id repetido entre aberturas do app sobrescreveria a sessão antiga.
    const session: TelemetrySession = {
      ...metadata.session,
      id: toSessionId(crypto.randomUUID()),
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
        canaisDeAnalise.map(async (name) => [name, await collect(file.readChannel(name))] as const),
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

    store.saveRecording({ session, laps, seriesByLap });
    store.recordIngestedFile(path, session.id);

    // Publica tudo automaticamente, mas só enfileirando: a ingestão não espera
    // rede, e a sessão nasce privada na api (ADR 0013).
    store.enqueuePublication(session.id);

    // Só depois de tudo gravado: evento anunciando o que já é verdade, nunca
    // o que está a caminho.
    emit({ type: 'session-ingested', sessionId: session.id, lapCount: laps.length });

    return session.id;
  } finally {
    await file.close();
  }
}
