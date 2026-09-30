import type { GapDto } from '../../../shared/overlay.js';

/**
 * Números do overlay, lidos de relance: pt-BR, sempre a mesma largura de casas
 * decimais para a coluna não dançar.
 */
const virgula = (texto: string) => texto.replace('.', ',');

/** `83.456` → `1:23,456`. */
export function lapTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  const text = virgula(rest.toFixed(3)).padStart(6, '0');
  return minutes > 0 ? `${minutes}:${text}` : virgula(rest.toFixed(3));
}

/** Tempo de sessão: `1:02:03` ou `12:34`. */
export function clock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

/** Segundos com uma casa, sem sinal: a posição na lista já diz se é à frente ou atrás. */
export function seconds(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return virgula(Math.abs(value).toFixed(1));
}

export function gap(value: GapDto | null): string {
  if (value === null) return '';
  if (value.kind === 'laps') return `+${value.laps} V`;
  return `+${virgula(value.seconds.toFixed(value.seconds < 60 ? 1 : 0))}`;
}

/** Delta com sinal e duas casas: `-0,25`, `+1,02`. */
export function delta(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${virgula(Math.abs(value).toFixed(2))}`;
}

/** `2345` → `2,3k`; abaixo de mil, o número inteiro. */
export function iRating(value: number | null): string {
  if (value === null) return '—';
  if (value < 1000) return String(Math.round(value));
  return `${virgula((value / 1000).toFixed(1))}k`;
}

export function safetyRating(value: number | null): string {
  return value === null ? '' : virgula(value.toFixed(2));
}

export function liters(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? '—' : `${virgula(value.toFixed(digits))} L`;
}

export function laps(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : virgula(value.toFixed(1));
}

/**
 * Texto que se lê sobre uma cor que vem do sim (carteira, classe): preto ou
 * branco, o de maior contraste pela luminância relativa do WCAG. É conta, não
 * escolha.
 */
export function inkOn(background: string | null): string {
  if (background === null) return '#ffffff';
  const hex = background.replace('#', '');
  const channel = (at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  // Contraste com branco vs. com preto; vence o maior.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

/**
 * O tipo de sessão como o sim escreve ("Race", "Open Qualify"), em português. O
 * que não está aqui aparece como veio.
 */
const SESSION_TYPES: Record<string, string> = {
  race: 'Corrida',
  practice: 'Treino',
  qualify: 'Classificação',
  'open qualify': 'Classificação',
  'lone qualify': 'Classificação',
  warmup: 'Aquecimento',
  'offline testing': 'Teste',
};

export function sessionLabel(type: string | null): string {
  if (type === null) return 'Sessão';
  return SESSION_TYPES[type.trim().toLowerCase()] ?? type;
}
