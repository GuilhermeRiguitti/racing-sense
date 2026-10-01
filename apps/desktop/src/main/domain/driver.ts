/**
 * Quem está em cada carro da sessão, como o sim declara.
 *
 * Existe para o overlay (ADR 0025): o piloto vê, na própria tela, o nome,
 * carro, carteira e iRating de quem está à volta dele — o mesmo que o sim
 * mostra. Nada disto é gravado nem sai da máquina (ADR 0022).
 */
export interface License {
  /** A classe da carteira: `R`, `D`, `C`, `B`, `A`, `P`, `WC`. */
  readonly letter: string;
  /** O safety rating, como o sim publica ("3.45" → 3,45). */
  readonly safetyRating: number | null;
  /** A cor que o iRacing dá à carteira, em `#rrggbb`. */
  readonly color: string | null;
}

export interface CarModel {
  /** O nome completo que o sim dá ao carro: "Ferrari 296 GT3". */
  readonly name: string;
  /** O fabricante reconhecido no nome, quando há um. */
  readonly make: CarMake | null;
}

export interface GridDriver {
  /** A posição do carro nos canais `CarIdx*`. */
  readonly carIdx: number;
  readonly name: string;
  readonly carNumber: string;
  readonly car: CarModel;
  readonly classId: number;
  readonly className: string;
  readonly classColor: string | null;
  /**
   * Tempo de volta estimado da classe, pelo sim (`CarClassEstLapTime`). É a
   * régua com que o gap relativo dá a volta na linha de chegada.
   */
  readonly classEstLapTime: number | null;
  readonly iRating: number | null;
  readonly license: License | null;
  readonly teamName: string | null;
  /** O pace car ocupa um `CarIdx` e não disputa nada. */
  readonly isPaceCar: boolean;
  /** Quem só assiste também aparece na lista. */
  readonly isSpectator: boolean;
}

/** Quem disputa a sessão: nem pace car, nem espectador. */
export function isCompetitor(driver: GridDriver): boolean {
  return !driver.isPaceCar && !driver.isSpectator;
}

/**
 * `LicString` do sim → carteira. `"A 3.45"`: letra, espaço, safety rating.
 * Texto fora dessa forma devolve `null` — carteira adivinhada seria pior que
 * nenhuma.
 */
export function parseLicense(text: string | undefined, color: string | null): License | null {
  if (text === undefined) return null;
  const match = /^\s*([A-Za-z]+)\s+(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (match === null) return null;
  const [, letter, rating] = match;
  return { letter: (letter as string).toUpperCase(), safetyRating: Number(rating), color };
}

/**
 * Cor do sim em `#rrggbb`. O iRacing escreve `0xffda59` (cor da classe, cor da
 * carteira); texto que não é cor vira `null`.
 */
export function parseSimColor(text: string | undefined): string | null {
  if (text === undefined) return null;
  const match = /^\s*0x([0-9a-f]{1,6})\s*$/i.exec(text);
  return match === null ? null : `#${(match[1] as string).toLowerCase().padStart(6, '0')}`;
}

// --- fabricantes --------------------------------------------------------------

export interface CarMake {
  /**
   * Identificador estável, em minúsculas e com hífen: `ferrari`, `mercedes-amg`.
   * É o nome do arquivo da logo no renderer — trocar um quebra a logo dele.
   */
  readonly id: string;
  /** Como o fabricante é escrito. */
  readonly name: string;
  /** Três ou quatro letras: o que o overlay mostra quando não há logo. */
  readonly short: string;
}

/**
 * Fabricantes que aparecem no nome dos carros do iRacing.
 *
 * Não é catálogo de carros: o carro continua sendo o que o sim declara. Isto só
 * reconhece o fabricante dentro do nome ("Mercedes-AMG GT3 2020" → AMG). Carro
 * de fabricante fora da lista fica sem marca — nunca com uma adivinhada. O
 * primeiro alias que casa é o mais específico ("Mercedes-AMG" antes de
 * "Mercedes").
 */
const MAKES: readonly { readonly make: CarMake; readonly aliases: readonly string[] }[] = [
  { make: { id: 'acura', name: 'Acura', short: 'ACU' }, aliases: ['Acura'] },
  { make: { id: 'alfa-romeo', name: 'Alfa Romeo', short: 'ALF' }, aliases: ['Alfa Romeo'] },
  { make: { id: 'aston-martin', name: 'Aston Martin', short: 'AST' }, aliases: ['Aston Martin'] },
  { make: { id: 'audi', name: 'Audi', short: 'AUD' }, aliases: ['Audi'] },
  { make: { id: 'bmw', name: 'BMW', short: 'BMW' }, aliases: ['BMW'] },
  { make: { id: 'cadillac', name: 'Cadillac', short: 'CAD' }, aliases: ['Cadillac'] },
  { make: { id: 'chevrolet', name: 'Chevrolet', short: 'CHV' }, aliases: ['Chevrolet', 'Chevy'] },
  { make: { id: 'dallara', name: 'Dallara', short: 'DAL' }, aliases: ['Dallara'] },
  { make: { id: 'dodge', name: 'Dodge', short: 'DOD' }, aliases: ['Dodge'] },
  { make: { id: 'ferrari', name: 'Ferrari', short: 'FER' }, aliases: ['Ferrari'] },
  { make: { id: 'ford', name: 'Ford', short: 'FRD' }, aliases: ['Ford'] },
  { make: { id: 'holden', name: 'Holden', short: 'HOL' }, aliases: ['Holden'] },
  { make: { id: 'honda', name: 'Honda', short: 'HON' }, aliases: ['Honda'] },
  { make: { id: 'hyundai', name: 'Hyundai', short: 'HYU' }, aliases: ['Hyundai'] },
  { make: { id: 'kia', name: 'Kia', short: 'KIA' }, aliases: ['Kia'] },
  { make: { id: 'lamborghini', name: 'Lamborghini', short: 'LAM' }, aliases: ['Lamborghini'] },
  { make: { id: 'lexus', name: 'Lexus', short: 'LEX' }, aliases: ['Lexus'] },
  { make: { id: 'ligier', name: 'Ligier', short: 'LIG' }, aliases: ['Ligier'] },
  { make: { id: 'lotus', name: 'Lotus', short: 'LOT' }, aliases: ['Lotus'] },
  { make: { id: 'mazda', name: 'Mazda', short: 'MAZ' }, aliases: ['Mazda'] },
  { make: { id: 'mclaren', name: 'McLaren', short: 'MCL' }, aliases: ['McLaren'] },
  { make: { id: 'mercedes-amg', name: 'Mercedes-AMG', short: 'AMG' }, aliases: ['Mercedes-AMG', 'Mercedes AMG'] },
  { make: { id: 'mercedes', name: 'Mercedes', short: 'MER' }, aliases: ['Mercedes'] },
  { make: { id: 'mini', name: 'Mini', short: 'MINI' }, aliases: ['Mini'] },
  { make: { id: 'nissan', name: 'Nissan', short: 'NIS' }, aliases: ['Nissan'] },
  { make: { id: 'oreca', name: 'Oreca', short: 'ORE' }, aliases: ['Oreca'] },
  { make: { id: 'pontiac', name: 'Pontiac', short: 'PON' }, aliases: ['Pontiac'] },
  { make: { id: 'porsche', name: 'Porsche', short: 'POR' }, aliases: ['Porsche'] },
  { make: { id: 'radical', name: 'Radical', short: 'RAD' }, aliases: ['Radical'] },
  { make: { id: 'renault', name: 'Renault', short: 'REN' }, aliases: ['Renault'] },
  { make: { id: 'riley', name: 'Riley', short: 'RIL' }, aliases: ['Riley'] },
  { make: { id: 'ruf', name: 'Ruf', short: 'RUF' }, aliases: ['Ruf'] },
  { make: { id: 'subaru', name: 'Subaru', short: 'SUB' }, aliases: ['Subaru'] },
  { make: { id: 'toyota', name: 'Toyota', short: 'TOY' }, aliases: ['Toyota'] },
  { make: { id: 'volkswagen', name: 'Volkswagen', short: 'VW' }, aliases: ['Volkswagen', 'VW'] },
  { make: { id: 'williams', name: 'Williams', short: 'WIL' }, aliases: ['Williams'] },
];

/** Os ids de todos os fabricantes reconhecidos: os nomes de arquivo de logo válidos. */
export const CAR_MAKE_IDS: readonly string[] = MAKES.map(({ make }) => make.id);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * O carro com o fabricante reconhecido no nome.
 *
 * O fabricante é o que aparece **primeiro** no nome ("Super Formula SF23 -
 * Toyota" → Toyota; "Global Mazda MX-5 Cup" → Mazda), sempre como palavra
 * inteira ("Mini" não casa em "Minivan").
 */
export function toCarModel(name: string): CarModel {
  let best: { make: CarMake; index: number } | null = null;
  for (const { make, aliases } of MAKES) {
    for (const alias of aliases) {
      const match = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(alias)}(?![\\p{L}\\p{N}])`, 'iu').exec(
        name,
      );
      if (match === null) continue;
      const index = match.index + (match[1] as string).length;
      if (best === null || index < best.index) best = { make, index };
    }
  }
  return { name, make: best?.make ?? null };
}
