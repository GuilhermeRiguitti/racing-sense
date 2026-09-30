import { useRef } from 'react';
import type { FlagDto } from '../../../shared/overlay.js';
import type { ConnectedFrame } from './ConnectedFrame.js';

/**
 * Quanto tempo a verde fica na tela depois de acender. A verde fica acesa a
 * corrida inteira no sim; mostrá-la sempre seria ruído. Escolha de
 * apresentação, não de análise.
 */
const GREEN_VISIBLE_MS = 3000;

const LABEL: Record<FlagDto, string> = {
  disqualify: 'Desclassificado',
  black: 'Bandeira preta · cumpra a punição',
  repair: 'Dano · pare no box',
  furled: 'Aviso · bandeira preta',
  red: 'Bandeira vermelha',
  checkered: 'Bandeira quadriculada',
  yellow: 'Bandeira amarela',
  blue: 'Azul · deixe passar',
  debris: 'Detritos na pista',
  white: 'Última volta',
  green: 'Verde',
};

/**
 * A bandeira mais importante acesa para o piloto, e só ela. Sem bandeira, o
 * widget não desenha nada — é o que mais ajuda a tela a não ficar poluída.
 * A ordem de importância é a que o quadro já entrega.
 */
export function FlagBanner({ frame, editing }: { frame: ConnectedFrame; editing: boolean }) {
  const greenSince = useRef<number | null>(null);
  const flags = frame.player?.flags ?? [];
  const [top] = flags;

  if (top === 'green') {
    greenSince.current ??= Date.now();
  } else {
    greenSince.current = null;
  }
  const hideGreen = top === 'green' && Date.now() - (greenSince.current ?? 0) > GREEN_VISIBLE_MS;

  if (top === undefined || hideGreen) {
    return editing ? <div className="ov-flag is-placeholder">Bandeira</div> : null;
  }
  return <div className={`ov-flag is-${top}`}>{LABEL[top]}</div>;
}
