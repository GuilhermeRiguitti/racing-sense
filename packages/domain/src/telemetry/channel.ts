import { InvariantError } from '../shared/errors.js';

/**
 * Tipo de um canal, no vocabulário do domínio — não no do arquivo binário.
 *
 * A separação que importa é **contínuo contra discreto**, porque decide se é
 * permitido calcular um valor entre duas amostras:
 *
 * - `number` é contínuo (velocidade, freio, RPM). Entre 200 e 210 km/h existe
 *   205, e interpolar é legítimo.
 * - `integer`, `boolean`, `bitfield` e `text` são discretos. Entre a 3ª e a 4ª
 *   marcha não existe 3,5ª; entre "na box" e "fora" não existe meio-termo.
 *   Interpolar produz valor que nunca aconteceu.
 *
 * Um terço dos canais do iRacing é discreto (55 inteiros, 28 booleanos e 3
 * bitfields de 288). Tratar todos como `number` funcionava enquanto o sistema só
 * olhava velocidade; quebrou na primeira marcha.
 */
export type ChannelType = 'number' | 'integer' | 'boolean' | 'text' | 'bitfield';

/** Se é permitido calcular valor entre duas amostras deste tipo. */
export function isContinuous(type: ChannelType): boolean {
  return type === 'number';
}

/**
 * Descrição de um canal de telemetria.
 *
 * Vem da tabela de variáveis do arquivo, montada em runtime. O domínio nunca
 * mantém lista fixa de canais: o conjunto muda entre carros e builds do sim.
 */
export interface ChannelDescriptor {
  readonly name: string;
  readonly description: string;
  readonly unit: string;
  readonly type: ChannelType;
  /** Maior que 1 em canais indexados por carro. */
  readonly valuesPerSample: number;
}

/** Eixo de uma série. Comparação entre voltas é sempre em `lapDistPct`. */
export type SeriesAxis = 'time' | 'lapDistPct';

/** Série de um canal ao longo de um eixo. `x` e `y` têm sempre o mesmo tamanho. */
export interface ChannelSeries {
  readonly channel: string;
  readonly unit: string;
  /** Viaja com a série para quem for reamostrar saber se pode interpolar. */
  readonly type: ChannelType;
  readonly axis: SeriesAxis;
  readonly x: readonly number[];
  readonly y: readonly number[];
}

/**
 * Constrói uma série garantindo as invariantes.
 *
 * Use sempre isto em vez do literal: série com `x` e `y` de tamanhos diferentes
 * produz gráfico torto e delta errado, e o sintoma aparece longe da causa.
 */
export function createChannelSeries(input: {
  channel: string;
  unit: string;
  type: ChannelType;
  axis: SeriesAxis;
  x: readonly number[];
  y: readonly number[];
}): ChannelSeries {
  if (input.x.length !== input.y.length) {
    throw new InvariantError(
      `Série "${input.channel}": x tem ${input.x.length} pontos e y tem ${input.y.length}`,
    );
  }
  // Não existe checagem de faixa para `lapDistPct`, de propósito. A faixa [0, 1]
  // parecia invariante e não é: numa volta válida de Suzuka o sim reportou
  // -0,0000129 logo depois da linha. É o dado como ele é, e recusá-lo seria
  // rejeitar a volta por uma suposição minha. O que protege contra byte lido
  // no lugar errado são as identidades exatas do formato, no teste de
  // integração — não um intervalo aqui.
  for (const value of input.x) {
    if (!Number.isFinite(value)) {
      throw new InvariantError(`Série "${input.channel}": eixo com valor não finito (${value})`);
    }
  }
  return {
    channel: input.channel,
    unit: input.unit,
    type: input.type,
    axis: input.axis,
    x: input.x,
    y: input.y,
  };
}
