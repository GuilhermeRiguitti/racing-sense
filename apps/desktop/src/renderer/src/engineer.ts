import { summarizeSeries } from '../../main/domain/lap-summary.js';
import type { ChannelDto, LapDto, SeriesDto, StintLapDto } from '../../shared/dto.js';
import { CORNERS, type Corner, GRAVIDADE_PADRAO, inCarAdjustments } from './channels.js';
import { valueAtCursor } from './chart-math.js';

/**
 * O que o painel do engenheiro mostra, em contas puras — testadas sem navegador.
 *
 * Nada aqui julga. A tela diz que a borda interna do pneu está 8 °C mais quente
 * que a externa; não diz se isso é bom. "Bom" depende de carro, composto e
 * pista, e um limiar escrito aqui seria número arbitrado na análise (regra 18).
 * Quem interpreta é o piloto — e, quando entrar, o narrador, com os números
 * prontos na mão.
 */

const serie = (series: readonly SeriesDto[], channel: string) =>
  series.find((s) => s.channel === channel && s.y.length > 0);

/** Média da volta, ou o valor no cursor quando ele está sobre o gráfico. */
function leitura(s: SeriesDto | undefined, cursor: number | null): number | null {
  if (s === undefined) return null;
  if (cursor !== null) return valueAtCursor(s, cursor) ?? null;
  return summarizeSeries(s)?.mean ?? null;
}

// --- pneus ------------------------------------------------------------------

export interface TireBand {
  /** Onde fica na banda, na língua do box: externa, meio, interna. */
  readonly position: 'ext' | 'meio' | 'int';
  readonly celsius: number | null;
}

export interface TireReading {
  readonly corner: Corner;
  /** As três faixas na ordem em que aparecem olhando o carro de cima. */
  readonly bands: readonly TireBand[];
  /** Qual temperatura é: da superfície da banda ou da carcaça. */
  readonly source: 'surface' | 'carcass' | null;
  readonly pressureKpa: number | null;
  /** Borracha restante por faixa, em %, ao fim da volta. */
  readonly wearPct: readonly (number | null)[] | null;
  /** Interna menos externa, em °C. Positivo: a interna está mais quente. */
  readonly innerMinusOuter: number | null;
  /** Meio menos a média das bordas, em °C. */
  readonly middleMinusEdges: number | null;
}

/**
 * O pneu de cada roda: temperatura nas três faixas, pressão e desgaste.
 *
 * `L` e `R` no nome do canal são os lados da banda olhando para a frente do
 * carro. Num pneu esquerdo, `L` é o lado de fora; num direito, é o de dentro.
 * Desenhado de cima, a ordem `L, M, R` já é a ordem espacial — só o rótulo
 * (externa/interna) depende do lado do carro.
 *
 * Superfície quando o arquivo tem; senão, carcaça. As duas medem coisas
 * diferentes e não se misturam na mesma leitura.
 */
export function tireReadings(series: readonly SeriesDto[], cursor: number | null): TireReading[] {
  return CORNERS.map((corner) => {
    const superficie = ['tempL', 'tempM', 'tempR'].map((m) => serie(series, `${corner.prefix}${m}`));
    const carcaca = ['tempCL', 'tempCM', 'tempCR'].map((m) => serie(series, `${corner.prefix}${m}`));
    const temSuperficie = superficie.some((s) => s !== undefined);
    const temCarcaca = carcaca.some((s) => s !== undefined);
    const faixas = temSuperficie ? superficie : carcaca;

    const posicoes: TireBand['position'][] =
      corner.side === 'left' ? ['ext', 'meio', 'int'] : ['int', 'meio', 'ext'];
    const bands = faixas.map((s, i) => ({
      position: posicoes[i] ?? 'meio',
      celsius: leitura(s, cursor),
    }));

    const valor = (posicao: TireBand['position']) =>
      bands.find((b) => b.position === posicao)?.celsius ?? null;
    const [ext, meio, int] = [valor('ext'), valor('meio'), valor('int')];

    const desgaste = ['wearL', 'wearM', 'wearR'].map((m) => serie(series, `${corner.prefix}${m}`));
    const wearPct = desgaste.some((s) => s !== undefined)
      ? desgaste.map((s) => {
          const ultimo = s === undefined ? null : (s.y[s.y.length - 1] ?? null);
          return ultimo === null ? null : ultimo * 100;
        })
      : null;

    return {
      corner,
      bands,
      source: temSuperficie ? 'surface' : temCarcaca ? 'carcass' : null,
      pressureKpa: leitura(serie(series, `${corner.prefix}pressure`), cursor),
      wearPct,
      innerMinusOuter: int !== null && ext !== null ? int - ext : null,
      middleMinusEdges: meio !== null && int !== null && ext !== null ? meio - (int + ext) / 2 : null,
    };
  });
}

// --- combustível --------------------------------------------------------------

export interface FuelReading {
  /** Gasto na volta, em litros. `null` quando não dá para saber. */
  readonly usedLiters: number | null;
  /** No tanque ao fim da volta. */
  readonly remainingLiters: number;
  /** Quantas voltas iguais a esta cabem no que sobrou. */
  readonly lapsRemaining: number | null;
  /** O nível subiu na volta: passou pelo box e abasteceu. */
  readonly refueled: boolean;
}

/**
 * Consumo medido: nível no começo menos nível no fim da volta.
 *
 * Só em volta completa — a volta cortada pela gravação não gastou "uma volta".
 * A projeção de voltas restantes é divisão, não estimativa: o que sobrou
 * dividido pelo que esta volta gastou.
 */
export function fuelReading(series: readonly SeriesDto[], lap: LapDto): FuelReading | null {
  const s = serie(series, 'FuelLevel');
  if (s === undefined) return null;
  const resumo = summarizeSeries(s);
  if (resumo === null) return null;

  const gasto = resumo.first - resumo.last;
  const refueled = gasto < 0;
  const usedLiters = lap.isComplete && !refueled ? gasto : null;
  return {
    usedLiters,
    remainingLiters: resumo.last,
    lapsRemaining: usedLiters !== null && usedLiters > 0 ? resumo.last / usedLiters : null,
    refueled,
  };
}

// --- ajustes de dentro do carro ------------------------------------------------

export interface AdjustmentReading {
  readonly channel: string;
  readonly label: string;
  readonly unit: string;
  readonly first: number;
  readonly last: number;
  /** Mexeu durante a volta. */
  readonly changed: boolean;
}

/** Cada ajuste que o carro tem, com o valor da volta e se ele mudou nela. */
export function adjustmentReadings(
  series: readonly SeriesDto[],
  channels: readonly ChannelDto[],
): AdjustmentReading[] {
  return inCarAdjustments(channels).flatMap((ajuste) => {
    const s = serie(series, ajuste.name);
    const resumo = s === undefined ? null : summarizeSeries(s);
    if (resumo === null) return [];
    return [
      {
        channel: ajuste.name,
        label: ajuste.description || ajuste.name,
        unit: ajuste.unit,
        first: resumo.first,
        last: resumo.last,
        changed: resumo.min !== resumo.max,
      },
    ];
  });
}

export interface AdjustmentChange {
  readonly lapNumber: number;
  readonly label: string;
  readonly unit: string;
  readonly from: number;
  readonly to: number;
  /** Mudou com o carro andando, ou entre uma volta e a seguinte (no box). */
  readonly when: 'during-lap' | 'between-laps';
}

/**
 * Quando o piloto mexeu em cada ajuste ao longo da sessão.
 *
 * Compara o fim de uma volta com o começo da seguinte, e o começo de cada
 * volta com o fim dela. Mudança é diferença de valor, nada mais — o sim grava
 * o ajuste como degrau, então qualquer diferença é um clique do piloto.
 */
export function adjustmentTimeline(
  stint: readonly StintLapDto[],
  channels: readonly ChannelDto[],
): AdjustmentChange[] {
  const mudancas: AdjustmentChange[] = [];
  for (const ajuste of inCarAdjustments(channels)) {
    const label = ajuste.description || ajuste.name;
    let anterior: number | null = null;
    for (const { lap, channels: resumos } of stint) {
      const resumo = resumos.find((r) => r.channel === ajuste.name);
      if (resumo === undefined) continue;
      if (anterior !== null && anterior !== resumo.first) {
        mudancas.push({
          lapNumber: lap.number,
          label,
          unit: ajuste.unit,
          from: anterior,
          to: resumo.first,
          when: 'between-laps',
        });
      }
      if (resumo.first !== resumo.last) {
        mudancas.push({
          lapNumber: lap.number,
          label,
          unit: ajuste.unit,
          from: resumo.first,
          to: resumo.last,
          when: 'during-lap',
        });
      }
      anterior = resumo.last;
    }
  }
  return mudancas.sort((a, b) => a.lapNumber - b.lapNumber);
}

// --- dinâmica e motor -----------------------------------------------------------

export interface DynamicsReading {
  /** Maior aceleração lateral da volta, em g, para qualquer lado. */
  readonly peakLateralG: number | null;
  /** Maior desaceleração, em g. */
  readonly peakBrakingG: number | null;
  /** Fração da volta com o ABS atuando, em %. */
  readonly absActivePct: number | null;
  readonly maxWaterC: number | null;
  readonly maxOilC: number | null;
  readonly minOilPressBar: number | null;
}

export function dynamicsReading(series: readonly SeriesDto[]): DynamicsReading {
  const resumo = (channel: string) => {
    const s = serie(series, channel);
    return s === undefined ? null : summarizeSeries(s);
  };
  const lateral = resumo('LatAccel');
  const longitudinal = resumo('LongAccel');
  const abs = resumo('BrakeABSactive');

  return {
    peakLateralG:
      lateral === null
        ? null
        : Math.max(Math.abs(lateral.min), Math.abs(lateral.max)) / GRAVIDADE_PADRAO,
    // Frenagem é aceleração longitudinal negativa; a maior é o mínimo.
    peakBrakingG:
      longitudinal === null ? null : Math.max(0, -longitudinal.min) / GRAVIDADE_PADRAO,
    absActivePct: abs?.mean === null || abs === null ? null : abs.mean * 100,
    maxWaterC: resumo('WaterTemp')?.max ?? null,
    maxOilC: resumo('OilTemp')?.max ?? null,
    minOilPressBar: resumo('OilPress')?.min ?? null,
  };
}

// --- a sessão volta a volta -------------------------------------------------------

/**
 * Um valor por volta, para os gráficos de evolução do stint. `null` quando a
 * volta não tem o canal — o gráfico deixa o buraco em vez de ligar por cima.
 */
export function perLap(
  stint: readonly StintLapDto[],
  channel: string,
  pick: 'mean' | 'last' | 'max',
): (number | null)[] {
  return stint.map(({ channels }) => {
    const resumo = channels.find((r) => r.channel === channel);
    if (resumo === undefined) return null;
    return resumo[pick];
  });
}
