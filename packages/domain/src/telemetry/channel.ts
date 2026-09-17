import { InvariantError } from '../shared/errors.js';

/** Tipo de um canal, no vocabulário do domínio — não no do arquivo binário. */
export type ChannelType = 'number' | 'boolean' | 'text' | 'bitfield';

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
  axis: SeriesAxis;
  x: readonly number[];
  y: readonly number[];
}): ChannelSeries {
  if (input.x.length !== input.y.length) {
    throw new InvariantError(
      `Série "${input.channel}": x tem ${input.x.length} pontos e y tem ${input.y.length}`,
    );
  }
  if (input.axis === 'lapDistPct') {
    for (const value of input.x) {
      if (value < 0 || value > 1) {
        throw new InvariantError(
          `Série "${input.channel}": eixo lapDistPct fora de [0, 1] (valor ${value})`,
        );
      }
    }
  }
  return {
    channel: input.channel,
    unit: input.unit,
    axis: input.axis,
    x: input.x,
    y: input.y,
  };
}
