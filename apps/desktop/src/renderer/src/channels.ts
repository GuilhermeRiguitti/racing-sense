import type { CarLimitsDto, ChannelDto, SeriesDto, SessionDto } from '../../shared/dto.js';

/**
 * Como cada canal aparece na tela.
 *
 * Isto **não** é catálogo de canais (regra 13): é apresentação dos que a tela
 * sabe desenhar. Canal que o carro não tem simplesmente não vira linha, e
 * painel sem nenhuma linha não aparece — um carro sem sensor de altura não
 * ganha um painel vazio de suspensão.
 *
 * As conversões são de unidade, exatas: m/s × 3,6 = km/h, radiano × 180/π =
 * grau, fração × 100 = %, metro × 1000 = mm, m/s² ÷ 9,80665 = g (a gravidade
 * padrão, definida por convenção). Nenhuma é escolha.
 */

/**
 * Cor de uma linha. `1` a `4` são as posições fixas da paleta categórica;
 * `reference` é a volta de referência, neutra, por baixo da volta.
 */
export type Slot = 1 | 2 | 3 | 4 | 'reference';

/** De onde a série sai: da volta escolhida ou da referência. */
export type SeriesSource = 'lap' | 'reference';

export interface ChannelView {
  readonly channel: string;
  readonly source: SeriesSource;
  readonly slot: Slot;
  /** Nome curto que aparece na legenda e no painel. */
  readonly label: string;
  readonly unit: string;
  readonly toDisplay: (valor: number) => number;
  readonly format: (valor: number) => string;
}

/** Uma régua horizontal que vem do carro, não da volta: a rotação de troca. */
export interface PanelRule {
  readonly value: number;
  readonly label: string;
}

export interface PanelView {
  readonly id: string;
  readonly title: string;
  /** Um painel, um eixo. Duas linhas só dividem painel se dividem a unidade. */
  readonly channels: readonly ChannelView[];
  /** Faixa fixa quando a física dá uma; senão sai dos dados. */
  readonly domain: 'from-zero' | 'symmetric' | 'data' | readonly [number, number];
  readonly height: number;
  readonly rules?: readonly PanelRule[];
}

export interface TabView {
  readonly id: string;
  readonly title: string;
  readonly panels: readonly PanelView[];
}

// --- formatos ---------------------------------------------------------------

const virgula = (texto: string) => texto.replace('.', ',');
export const inteiro = (valor: number) => Math.round(valor).toLocaleString('pt-BR');
export const umaCasa = (valor: number) => virgula(valor.toFixed(1));
export const duasCasas = (valor: number) => virgula(valor.toFixed(2));
const identidade = (valor: number) => valor;
/** Gravidade padrão: constante de definição (CGPM, 1901), não medida nossa. */
export const GRAVIDADE_PADRAO = 9.80665;

// --- as quatro rodas --------------------------------------------------------

/**
 * As rodas, com a cor fixa de cada uma em todo painel: a dianteira esquerda é
 * sempre azul, do painel de temperatura ao de altura. Cor segue a roda, não a
 * posição na lista.
 */
export const CORNERS = [
  { prefix: 'LF', label: 'DE', name: 'Dianteira esquerda', slot: 1, side: 'left' },
  { prefix: 'RF', label: 'DD', name: 'Dianteira direita', slot: 2, side: 'right' },
  { prefix: 'LR', label: 'TE', name: 'Traseira esquerda', slot: 3, side: 'left' },
  { prefix: 'RR', label: 'TD', name: 'Traseira direita', slot: 4, side: 'right' },
] as const;

export type Corner = (typeof CORNERS)[number];

function porRoda(
  medida: string,
  unit: string,
  toDisplay: (valor: number) => number,
  format: (valor: number) => string,
): ChannelView[] {
  return CORNERS.map((roda) => ({
    channel: `${roda.prefix}${medida}`,
    source: 'lap' as const,
    slot: roda.slot,
    label: roda.label,
    unit,
    toDisplay,
    format,
  }));
}

// --- painéis ----------------------------------------------------------------

const canal = (
  channel: string,
  label: string,
  unit: string,
  toDisplay: (valor: number) => number,
  format: (valor: number) => string,
  slot: Slot = 1,
  source: SeriesSource = 'lap',
): ChannelView => ({ channel, source, slot, label, unit, toDisplay, format });

const velocidade = (v: number) => v * 3.6;
const porcento = (v: number) => v * 100;
const grausDeRadiano = (v: number) => (v * 180) / Math.PI;
const milimetros = (v: number) => v * 1000;
const emG = (v: number) => v / GRAVIDADE_PADRAO;

/**
 * `comparison` é o nome da linha neutra por baixo: a referência, na volta
 * gravada; a volta anterior, ao vivo.
 */
function pilotagem(carLimits: CarLimitsDto, comparison = 'Referência'): PanelView[] {
  const { shiftRpm, redlineRpm } = carLimits;
  const reguasDeRotacao: PanelRule[] = [];
  if (shiftRpm !== null) reguasDeRotacao.push({ value: shiftRpm, label: 'troca' });
  if (redlineRpm !== null && redlineRpm !== shiftRpm) {
    reguasDeRotacao.push({ value: redlineRpm, label: 'corte' });
  }

  return [
    {
      id: 'speed',
      title: 'Velocidade',
      channels: [
        canal('Speed', 'Volta', 'km/h', velocidade, umaCasa, 1),
        canal('Speed', comparison, 'km/h', velocidade, umaCasa, 'reference', 'reference'),
      ],
      domain: 'from-zero',
      height: 150,
    },
    {
      id: 'pedals',
      title: 'Acelerador e freio',
      channels: [
        canal('Throttle', 'Acelerador', '%', porcento, inteiro, 1),
        canal('Brake', 'Freio', '%', porcento, inteiro, 2),
      ],
      domain: [0, 100],
      height: 110,
    },
    {
      id: 'gear',
      title: 'Marcha',
      channels: [
        // Convenção do iRacing: -1 é ré, 0 é ponto morto.
        canal('Gear', 'Marcha', '', identidade, (v) => (v < 0 ? 'R' : v === 0 ? 'N' : String(v))),
      ],
      domain: 'data',
      height: 90,
    },
    {
      id: 'steering',
      title: 'Volante',
      channels: [canal('SteeringWheelAngle', 'Volante', '°', grausDeRadiano, inteiro)],
      domain: 'symmetric',
      height: 100,
    },
    {
      id: 'rpm',
      title: 'Rotação',
      channels: [canal('RPM', 'Rotação', 'rpm', identidade, inteiro)],
      domain: 'from-zero',
      height: 90,
      rules: reguasDeRotacao,
    },
    {
      id: 'g',
      title: 'Aceleração',
      channels: [
        canal('LatAccel', 'Lateral', 'g', emG, duasCasas, 1),
        canal('LongAccel', 'Longitudinal', 'g', emG, duasCasas, 2),
      ],
      domain: 'symmetric',
      height: 110,
    },
  ];
}

const pneus: PanelView[] = [
  {
    id: 'tire-temp',
    title: 'Temperatura do pneu · centro da banda',
    channels: porRoda('tempM', '°C', identidade, umaCasa),
    domain: 'data',
    height: 130,
  },
  {
    id: 'tire-carcass',
    title: 'Temperatura da carcaça · centro',
    channels: porRoda('tempCM', '°C', identidade, umaCasa),
    domain: 'data',
    height: 130,
  },
  {
    id: 'tire-pressure',
    title: 'Pressão do pneu',
    channels: porRoda('pressure', 'kPa', identidade, umaCasa),
    domain: 'data',
    height: 130,
  },
  {
    id: 'brake-line',
    title: 'Pressão na linha de freio',
    channels: porRoda('brakeLinePress', 'bar', identidade, umaCasa),
    domain: 'from-zero',
    height: 110,
  },
];

const suspensao: PanelView[] = [
  {
    id: 'ride-height',
    title: 'Altura do carro',
    channels: porRoda('rideHeight', 'mm', milimetros, umaCasa),
    domain: 'data',
    height: 140,
  },
  {
    id: 'shock',
    title: 'Curso do amortecedor',
    channels: porRoda('shockDefl', 'mm', milimetros, umaCasa),
    domain: 'data',
    height: 140,
  },
  {
    id: 'yaw',
    title: 'Velocidade de guinada',
    channels: [canal('YawRate', 'Guinada', '°/s', grausDeRadiano, inteiro)],
    domain: 'symmetric',
    height: 100,
  },
];

/**
 * Os ajustes de dentro do carro, um painel por ajuste — cada um tem a sua
 * unidade. Vêm do catálogo do arquivo (`dc` + maiúscula), com o nome que o
 * próprio sim dá a eles.
 */
export function inCarAdjustments(channels: readonly ChannelDto[]): ChannelDto[] {
  return channels.filter(
    (c) =>
      /^dc[A-Z]/.test(c.name) && c.valuesPerSample === 1 && c.type !== 'boolean' && c.type !== 'text',
  );
}

function carro(session: SessionDto): PanelView[] {
  const ajustes: PanelView[] = inCarAdjustments(session.channels).map((ajuste) => ({
    id: ajuste.name,
    title: `Ajuste · ${ajuste.description || ajuste.name}`,
    channels: [canal(ajuste.name, ajuste.name, ajuste.unit, identidade, formatoLivre)],
    domain: 'data',
    height: 70,
  }));

  return [
    {
      id: 'fuel',
      title: 'Combustível no tanque',
      channels: [canal('FuelLevel', 'Combustível', 'l', identidade, duasCasas)],
      domain: 'data',
      height: 90,
    },
    {
      id: 'engine-temp',
      title: 'Temperaturas do motor',
      channels: [
        canal('WaterTemp', 'Água', '°C', identidade, umaCasa, 1),
        canal('OilTemp', 'Óleo', '°C', identidade, umaCasa, 2),
      ],
      domain: 'data',
      height: 100,
    },
    {
      id: 'oil-press',
      title: 'Pressão do óleo',
      channels: [canal('OilPress', 'Óleo', 'bar', identidade, duasCasas)],
      domain: 'data',
      height: 80,
    },
    ...ajustes,
  ];
}

/** Número de canal cuja escala a tela não conhece: sem casa decimal inventada. */
export function formatoLivre(valor: number): string {
  if (Number.isInteger(valor)) return valor.toLocaleString('pt-BR');
  return virgula(Number(valor.toPrecision(4)).toString());
}

export function tabsFor(session: SessionDto): TabView[] {
  return [
    { id: 'driving', title: 'Pilotagem', panels: pilotagem(session.carLimits) },
    { id: 'tires', title: 'Pneus', panels: pneus },
    { id: 'suspension', title: 'Suspensão', panels: suspensao },
    { id: 'car', title: 'Carro', panels: carro(session) },
  ];
}

/**
 * Os painéis da volta ao vivo: os de pilotagem, com a volta anterior no lugar da
 * referência. Pneu e suspensão ficam para a volta gravada — ao vivo, o que o
 * piloto olha é o que ele fez com os pedais.
 */
export function livePanels(carLimits: CarLimitsDto): PanelView[] {
  return pilotagem(carLimits, 'Volta anterior');
}

/** Os canais que os painéis ao vivo desenham, sem repetição. */
export function channelsOf(panels: readonly PanelView[]): string[] {
  return [...new Set(panels.flatMap((panel) => panel.channels.map((view) => view.channel)))];
}

/** A série de um canal, se ela foi gravada. Carro sem o canal: sem linha. */
export function seriesFor(series: readonly SeriesDto[], channel: string): SeriesDto | undefined {
  return series.find((s) => s.channel === channel);
}
