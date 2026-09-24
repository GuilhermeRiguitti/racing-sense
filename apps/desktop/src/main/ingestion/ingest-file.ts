import type { DesktopEvent } from '../../shared/ipc.js';
import type { LocalStore } from '../db/local-store.js';
import {
  type ChannelDescriptor,
  type ChannelSeries,
  createChannelSeries,
} from '../domain/channel.js';
import { MissingChannelError, RepeatedLapNumberError } from '../domain/errors.js';
import type { SessionId } from '../domain/id.js';
import { toSessionId } from '../domain/id.js';
import { type Lap, stretchesWhere } from '../domain/lap.js';
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
export const OPTIONAL_LAP_CHANNELS = [
  'OnPitRoad',
  'PlayerTrackSurface',
  'SessionFlags',
  'PlayerCarMyIncidentCount',
] as const;

/**
 * Bit de `SessionFlags` da bandeira preta enrolada (`irsdk_furled`), a
 * advertência que o sim mostra com o slow down por corte de pista.
 *
 * Nos 83 arquivos do piloto (2026-09-24) ela acendeu 33 vezes: 30 na mesma
 * volta de uma saída de pista, em média 1,4 s depois dela. Ver ADR 0021.
 */
const FLAG_FURLED = 0x80000;

/**
 * Código do iRacing para "fora dos limites da pista" em `PlayerTrackSurface`.
 *
 * O vocabulário do sim para aqui: o domínio recebe booleano, não código.
 */
const SURFACE_OFF_TRACK = 0;

/** Código do iRacing para "carro fora do mundo do sim" (`irsdk_TrkLoc::NotInWorld`). */
const SURFACE_NOT_IN_WORLD = -1;

/** As quatro rodas, na grafia com que o sim prefixa os canais de cada uma. */
const CORNERS = ['LF', 'RF', 'LR', 'RR'] as const;

/**
 * O que o sim mede em cada roda. `tempL/M/R` é a superfície da banda, `tempCL/
 * CM/CR` a carcaça; `L` e `R` são os lados da banda olhando para a frente do
 * carro — num pneu esquerdo, `L` é o lado de fora.
 */
const PER_CORNER = [
  'tempL',
  'tempM',
  'tempR',
  'tempCL',
  'tempCM',
  'tempCR',
  'pressure',
  'wearL',
  'wearM',
  'wearR',
  'rideHeight',
  'shockDefl',
  'brakeLinePress',
] as const;

/**
 * Canais que viram série gravada por volta.
 *
 * Os seis primeiros respondem "onde perdi tempo". O resto é o que um
 * engenheiro de pista olha: pneu, suspensão, dinâmica, motor e combustível.
 *
 * Isto **não** é catálogo fixo (regra 13): é a lista do que vale gravar, e
 * canal ausente é ignorado, não é erro — o conjunto muda entre carros e builds
 * do sim. O tipo de cada canal vem do arquivo (contínuo ou discreto), a gravação
 * escolhe a largura exata pelo próprio dado, e a reamostragem sabe não
 * interpolar o que é discreto.
 */
export const ANALYSIS_CHANNELS: readonly string[] = [
  'Speed',
  'Throttle',
  'Brake',
  'Gear',
  'RPM',
  'SteeringWheelAngle',
  // Dinâmica: o que o carro fez com o que o piloto pediu.
  'LatAccel',
  'LongAccel',
  'YawRate',
  'BrakeABSactive',
  // Motor e combustível.
  'FuelLevel',
  'FuelUsePerHour',
  'WaterTemp',
  'OilTemp',
  'OilPress',
  // Superfície sob o carro: é daqui que sai onde a volta saiu da pista.
  'PlayerTrackSurface',
  ...CORNERS.flatMap((corner) => PER_CORNER.map((medida) => `${corner}${medida}`)),
];

/**
 * Ajuste feito de dentro do carro: balanço de freio, ABS, controle de tração,
 * barra estabilizadora — o acerto que muda **durante** as voltas.
 *
 * Não há lista deles: o conjunto é de cada carro. Eles saem do catálogo do
 * próprio arquivo, pela convenção de nome do sim (`dc` + maiúscula). Booleano
 * fica de fora porque, com esse prefixo, é botão (limitador do box, partida,
 * farol), não ajuste.
 */
export function isInCarAdjustment(channel: ChannelDescriptor): boolean {
  return (
    /^dc[A-Z]/.test(channel.name) &&
    channel.valuesPerSample === 1 &&
    channel.type !== 'boolean' &&
    channel.type !== 'text'
  );
}

/** O que gravar deste arquivo: a lista acima mais os ajustes que o carro tem. */
export function channelsToRecord(catalog: readonly ChannelDescriptor[]): string[] {
  const disponiveis = new Set(catalog.map((channel) => channel.name));
  const escolhidos = ANALYSIS_CHANNELS.filter((name) => disponiveis.has(name));
  const ajustes = catalog
    .filter(isInCarAdjustment)
    .map((channel) => channel.name)
    .filter((name) => !escolhidos.includes(name));
  return [...escolhidos, ...ajustes];
}

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

    const [lapNumber, lapDistPct, onPitRoad, trackSurface, sessionFlags, incidentCount] =
      await Promise.all([
        collect(file.readChannel('Lap')),
        collect(file.readChannel('LapDistPct')),
        opcional('OnPitRoad'),
        opcional('PlayerTrackSurface'),
        opcional('SessionFlags'),
        // Os do próprio piloto: é o número que o sim mostra como "Inc.".
        opcional('PlayerCarMyIncidentCount'),
      ]);

    const foraDaPista = trackSurface?.map((v) => v === SURFACE_OFF_TRACK);
    const recortadas: readonly Lap[] = detectLaps({
      tickRate: metadata.tickRate,
      lapNumber,
      lapDistPct,
      ...(onPitRoad !== undefined ? { onPitRoad: onPitRoad.map((v) => v !== 0) } : {}),
      ...(incidentCount !== undefined ? { incidentCount } : {}),
      ...(sessionFlags !== undefined
        ? { penalized: sessionFlags.map((v) => (v & FLAG_FURLED) !== 0) }
        : {}),
      ...(trackSurface !== undefined && foraDaPista !== undefined
        ? {
            offTrack: foraDaPista,
            inWorld: trackSurface.map((v) => v !== SURFACE_NOT_IN_WORLD),
          }
        : {}),
    });

    // O "onde" da saída de pista viaja com a volta: a marcação diz que saiu, o
    // trecho diz em que ponto — que é o que o piloto procura no gráfico.
    const laps: readonly Lap[] =
      foraDaPista === undefined
        ? recortadas
        : recortadas.map((lap) => ({
            ...lap,
            offTrackStretches: stretchesWhere(
              lapDistPct.slice(lap.startSample, lap.endSample + 1),
              foraDaPista.slice(lap.startSample, lap.endSample + 1),
            ),
          }));

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
    const canaisDeAnalise = channelsToRecord(metadata.channels);
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
