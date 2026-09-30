import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  DEFAULT_OVERLAY_SETTINGS,
  type DeltaReference,
  type DriverColumns,
  type OverlaySettings,
  type OverlaySettingsPatch,
  WIDGET_IDS,
  type WidgetSettings,
} from '../../shared/overlay.js';

/**
 * A configuração do overlay, num arquivo da pasta de dados (ADR 0025).
 *
 * Não é tabela do SQLite: posição de janela não é dado de corrida, e o arquivo
 * pode ser apagado sem perder nada além da arrumação.
 *
 * Tudo que entra passa por `sanitize`: arquivo editado à mão, de versão antiga
 * ou corrompido vira a configuração padrão naquilo que não entende, nunca uma
 * janela em posição impossível ou com escala zero.
 */
export interface OverlaySettingsStore {
  get(): OverlaySettings;
  update(patch: OverlaySettingsPatch): OverlaySettings;
  /** Avisa quem desenha as janelas. Devolve como cancelar. */
  subscribe(listener: (settings: OverlaySettings) => void): () => void;
}

export function createOverlaySettingsStore(path: string): OverlaySettingsStore {
  let settings = { ...load(path), editing: false };
  const listeners = new Set<(settings: OverlaySettings) => void>();

  return {
    get: () => settings,
    update(patch) {
      settings = sanitize(merge(settings, patch));
      save(path, settings);
      for (const listener of listeners) listener(settings);
      return settings;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function load(path: string): OverlaySettings {
  try {
    return sanitize(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    // Arquivo que ainda não existe é o primeiro uso; JSON quebrado não pode
    // impedir o app de abrir. Os dois caem no padrão.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      throw error;
    }
    return DEFAULT_OVERLAY_SETTINGS;
  }
}

function save(path: string, settings: OverlaySettings): void {
  // Destravado não é estado que se guarde: o app sempre abre com as janelas travadas.
  const { editing: _editing, ...persisted } = settings;
  mkdirSync(dirname(path), { recursive: true });
  // Grava ao lado e troca: um app fechado no meio da escrita não deixa meio JSON.
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(persisted, null, 2));
  renameSync(temporary, path);
}

/** Mescla profunda de objetos simples; o que não é objeto é substituído. */
function merge(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return patch === undefined ? base : patch;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = merge(base[key], value);
  }
  return merged;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const field = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined);

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/**
 * Número dentro da faixa, ou o padrão. As faixas são as do controle na tela —
 * limites de apresentação, não de análise.
 */
function number(value: unknown, fallback: number, min: number, max: number, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  return integer ? Math.round(clamped) : clamped;
}

const position = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;

const DELTA_REFERENCES: readonly DeltaReference[] = [
  'best',
  'optimal',
  'session-best',
  'session-optimal',
  'session-last',
];

function columns<T extends DriverColumns>(value: unknown, fallback: T): T {
  const result: Record<string, boolean> = {};
  for (const [key, standard] of Object.entries(fallback)) {
    result[key] = bool(field(value, key), standard as boolean);
  }
  return result as unknown as T;
}

export function sanitize(raw: unknown): OverlaySettings {
  const d = DEFAULT_OVERLAY_SETTINGS;
  const widgets = Object.fromEntries(
    WIDGET_IDS.map((id): [string, WidgetSettings] => {
      const value = field(field(raw, 'widgets'), id);
      return [
        id,
        {
          enabled: bool(field(value, 'enabled'), d.widgets[id].enabled),
          x: position(field(value, 'x')),
          y: position(field(value, 'y')),
          scale: number(field(value, 'scale'), 1, 0.5, 2.5),
        },
      ];
    }),
  ) as unknown as OverlaySettings['widgets'];

  const relative = field(raw, 'relative');
  const standings = field(raw, 'standings');
  const reference = field(field(raw, 'delta'), 'reference');

  return {
    visible: bool(field(raw, 'visible'), d.visible),
    editing: bool(field(raw, 'editing'), false),
    backgroundOpacity: number(field(raw, 'backgroundOpacity'), d.backgroundOpacity, 0.3, 1),
    widgets,
    relative: {
      carsAhead: number(field(relative, 'carsAhead'), d.relative.carsAhead, 0, 10, true),
      carsBehind: number(field(relative, 'carsBehind'), d.relative.carsBehind, 0, 10, true),
      columns: columns(field(relative, 'columns'), d.relative.columns),
    },
    standings: {
      leaders: number(field(standings, 'leaders'), d.standings.leaders, 1, 20, true),
      aroundPlayer: number(field(standings, 'aroundPlayer'), d.standings.aroundPlayer, 0, 10, true),
      otherClasses: number(field(standings, 'otherClasses'), d.standings.otherClasses, 0, 20, true),
      columns: columns(field(standings, 'columns'), d.standings.columns),
    },
    delta: {
      reference: DELTA_REFERENCES.includes(reference as DeltaReference)
        ? (reference as DeltaReference)
        : d.delta.reference,
    },
    inputs: { seconds: number(field(field(raw, 'inputs'), 'seconds'), d.inputs.seconds, 2, 20, true) },
    radar: {
      rangeMeters: number(field(field(raw, 'radar'), 'rangeMeters'), d.radar.rangeMeters, 10, 200, true),
    },
  };
}
