import { IbtFormatError } from './decoder.js';
import { SESSION_INFO_ENCODING } from './format.js';

/**
 * `TextDecoder` declarado à mão.
 *
 * Este pacote não declara `@types/node` nem a lib DOM de propósito — ele tem que
 * rodar igual em Node, browser e worker. `TextDecoder` é padrão nos três desde
 * sempre; declarar só o que usamos mantém a pureza sem fingir que a API não
 * existe.
 */
declare const TextDecoder: {
  new (label?: string): { decode(input?: Uint8Array): string };
};

/**
 * A árvore de session info: mapas, listas e texto.
 *
 * Tudo é string de propósito. `TrackLength: 4.0569 km` e `TimeOfDay: 5:50 pm`
 * mostram por quê: o valor carrega unidade e formato junto, e converter cedo
 * significaria adivinhar. Quem sabe o que cada campo é converte na hora de usar.
 */
export type SessionInfoValue = string | SessionInfoNode | SessionInfoValue[];
export interface SessionInfoNode {
  [key: string]: SessionInfoValue;
}

/**
 * Parser do YAML da iRacing.
 *
 * ## Por que não usar uma biblioteca de YAML
 *
 * Porque este arquivo não é YAML válido. Num arquivo real de Road Atlanta:
 *
 * ```yaml
 *   TimeOfDay: 5:50 pm
 * ```
 *
 * O valor tem dois-pontos e não está entre aspas — parser estrito recusa o
 * documento inteiro por causa de uma linha. E o problema não é raro nem
 * evitável: nome de equipe ("3:16 Racing"), horário, qualquer campo livre.
 *
 * O formato que a iRacing de fato emite é um subconjunto pequeno e regular:
 * mapas indentados, listas com `- `, e valores escalares que vão até o fim da
 * linha. Isso cabe em ~60 linhas, sem dependência, e trata a quebra acima como
 * o caso normal que ela é.
 *
 * Ver `docs/formato-ibt.md` e `docs/pendencias.md` (item 6).
 */
export function parseSessionInfo(text: string): SessionInfoNode {
  // Copiamos as linhas porque o parser reescreve o `-` de item de lista em
  // espaço, e a partir daí um item vira um mapa comum indentado.
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && line.trim() !== '---' && !line.startsWith('...'));

  let cursor = 0;

  const indentOf = (line: string): number => line.length - line.trimStart().length;
  const isListItem = (line: string): boolean => line.trimStart().startsWith('- ');

  const parseMapping = (indent: number): SessionInfoNode => {
    const node: SessionInfoNode = {};

    while (cursor < lines.length) {
      const line = lines[cursor] as string;
      if (indentOf(line) !== indent || isListItem(line)) {
        break;
      }

      const separator = line.indexOf(':');
      if (separator === -1) {
        throw new IbtFormatError(`linha de session info sem ":": ${line.trim()}`);
      }

      const key = line.slice(indent, separator).trim();
      // O valor vai até o fim da linha, inclusive com outros ":" dentro.
      const inline = line.slice(separator + 1).trim();
      cursor += 1;

      if (inline !== '') {
        node[key] = unquote(inline);
        continue;
      }

      const next = lines[cursor];
      if (next === undefined) {
        node[key] = '';
        continue;
      }

      const nextIndent = indentOf(next);
      if (isListItem(next) && nextIndent >= indent) {
        // Sequência pode vir na mesma indentação da chave — e vem, no iRacing.
        node[key] = parseSequence(nextIndent);
      } else if (nextIndent > indent) {
        node[key] = parseMapping(nextIndent);
      } else {
        node[key] = '';
      }
    }

    return node;
  };

  const parseSequence = (indent: number): SessionInfoValue[] => {
    const items: SessionInfoValue[] = [];

    while (cursor < lines.length) {
      const line = lines[cursor] as string;
      if (indentOf(line) !== indent || !isListItem(line)) {
        break;
      }

      // "- CarIdx: 0" vira "  CarIdx: 0": o item passa a ser um mapa comum,
      // e as chaves seguintes já estão nessa indentação.
      lines[cursor] = line.replace('- ', '  ');
      items.push(parseMapping(indent + 2));
    }

    return items;
  };

  return parseMapping(0);
}

/** Decodifica os bytes de session info e devolve a árvore. */
export function decodeSessionInfo(bytes: Uint8Array): SessionInfoNode {
  return parseSessionInfo(decodeSessionInfoText(bytes));
}

/**
 * Bytes de session info em texto.
 *
 * CP1252, **não** UTF-8: um piloto chamado "André" vira lixo se decodificado
 * errado, e como a maioria dos nomes é ASCII o bug só aparece muito depois.
 * O bloco vem preenchido com NUL até o tamanho declarado.
 */
export function decodeSessionInfoText(bytes: Uint8Array): string {
  return new TextDecoder(SESSION_INFO_ENCODING).decode(bytes).replace(/\0+$/, '');
}

/** Alguns campos vêm entre aspas — `CarNumber: "413"` — e outros não. */
const unquote = (value: string): string =>
  value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;

/** Caminha na árvore sem explodir quando um ramo não existe. */
export function readPath(
  node: SessionInfoValue | undefined,
  ...path: string[]
): string | undefined {
  let current: SessionInfoValue | undefined = node;
  for (const key of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = current[key];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Número de um campo que carrega unidade: `"4.0569 km"` → `4.0569`.
 * Devolve `null` quando não há número — ausência não é zero.
 */
export function readNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = /-?\d+(\.\d+)?/.exec(value);
  return match === null ? null : Number(match[0]);
}
