import type { SeriesDto } from '../../shared/dto.js';

/**
 * Como cada canal aparece na tela.
 *
 * Isto **não** é catálogo de canais (regra 15): é apresentação dos poucos que a
 * tela sabe desenhar. Canal gravado que não está aqui simplesmente não vira
 * painel — quando a análise de setup entrar, entra um painel novo, não uma
 * mudança no que se grava.
 *
 * As conversões são de unidade, exatas: m/s × 3,6 = km/h, radiano × 180/π =
 * grau, fração × 100 = %. Nenhuma é escolha.
 */
export interface ChannelView {
  readonly channel: string;
  /** Nome curto que aparece na legenda e no painel. */
  readonly label: string;
  readonly unit: string;
  readonly toDisplay: (valor: number) => number;
  readonly format: (valor: number) => string;
}

export interface PanelView {
  readonly title: string;
  /** Um painel, um eixo. Dois canais só dividem painel se dividem a unidade. */
  readonly channels: readonly ChannelView[];
  /** Faixa fixa quando a física dá uma; `null` quando sai dos dados. */
  readonly domain: 'from-zero' | 'symmetric' | 'data' | readonly [number, number];
  readonly height: number;
}

const inteiro = (valor: number) => Math.round(valor).toLocaleString('pt-BR');

export const PANELS: readonly PanelView[] = [
  {
    title: 'Velocidade',
    channels: [
      {
        channel: 'Speed',
        label: 'Velocidade',
        unit: 'km/h',
        toDisplay: (v) => v * 3.6,
        format: (v) => v.toFixed(1).replace('.', ','),
      },
    ],
    domain: 'from-zero',
    height: 150,
  },
  {
    title: 'Acelerador e freio',
    channels: [
      {
        channel: 'Throttle',
        label: 'Acelerador',
        unit: '%',
        toDisplay: (v) => v * 100,
        format: inteiro,
      },
      {
        channel: 'Brake',
        label: 'Freio',
        unit: '%',
        toDisplay: (v) => v * 100,
        format: inteiro,
      },
    ],
    domain: [0, 100],
    height: 110,
  },
  {
    title: 'Marcha',
    channels: [
      {
        channel: 'Gear',
        label: 'Marcha',
        unit: '',
        toDisplay: (v) => v,
        // Convenção do iRacing: -1 é ré, 0 é ponto morto.
        format: (v) => (v < 0 ? 'R' : v === 0 ? 'N' : String(v)),
      },
    ],
    domain: 'data',
    height: 110,
  },
  {
    title: 'Volante',
    channels: [
      {
        channel: 'SteeringWheelAngle',
        label: 'Volante',
        unit: '°',
        toDisplay: (v) => (v * 180) / Math.PI,
        format: inteiro,
      },
    ],
    domain: 'symmetric',
    height: 100,
  },
  {
    title: 'Rotação',
    channels: [
      {
        channel: 'RPM',
        label: 'Rotação',
        unit: 'rpm',
        toDisplay: (v) => v,
        format: inteiro,
      },
    ],
    domain: 'from-zero',
    height: 80,
  },
];

/** A série de um canal, se ela foi gravada. Carro sem o canal: painel sem linha. */
export function seriesFor(series: readonly SeriesDto[], channel: string): SeriesDto | undefined {
  return series.find((s) => s.channel === channel);
}
