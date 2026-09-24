/**
 * O acerto do carro como o sim o declarou na session info.
 *
 * É uma árvore, e não um tipo com campo por ajuste, de propósito: cada carro
 * tem a sua ficha. A Ferrari 296 tem `TiresAero`, `Chassis` e `Dampers`; um
 * fórmula tem asa dianteira e traseira; um carro de turismo não tem nenhum dos
 * dois. Um tipo com campos fixos seria catálogo fixo de novo (regra 13), e
 * perderia em silêncio o ajuste que o tipo não previu.
 *
 * Os valores ficam como o sim escreveu — `"152.0 kPa"`, `"-3.2 deg"`,
 * `"71C, 68C, 65C"` — porque a unidade e o formato vêm junto e variam por carro.
 * Converter aqui seria adivinhar.
 */
export interface SetupNode {
  /** A chave como veio do sim: `LeftFront`, `RideHeight`, `LastTempsOMI`. */
  readonly key: string;
  /** Valor de folha; `null` quando o nó é uma seção com filhos. */
  readonly value: string | null;
  readonly children: readonly SetupNode[];
}

/**
 * Limites do carro declarados pelo sim.
 *
 * Servem de régua na tela: a rotação de troca de marcha e a de corte são do
 * carro, não escolha nossa. `null` quando o arquivo não informa.
 */
export interface CarLimits {
  readonly redlineRpm: number | null;
  /** Onde a luz de troca acende por completo (`DriverCarSLShiftRPM`). */
  readonly shiftRpm: number | null;
  readonly fuelCapacityLiters: number | null;
}

export const UNKNOWN_CAR_LIMITS: CarLimits = {
  redlineRpm: null,
  shiftRpm: null,
  fuelCapacityLiters: null,
};
