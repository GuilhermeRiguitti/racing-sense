import { type CSSProperties, type ReactNode, useRef } from 'react';
import type { OverlaySettings, WidgetId } from '../../../shared/overlay.js';
import { bridge } from '../bridge.js';
import { DeltaBar } from './DeltaBar.js';
import { FlagBanner } from './FlagBanner.js';
import { Fuel } from './Fuel.js';
import { useFitWindow, useOverlayFrame, useOverlaySettings } from './hooks.js';
import { Inputs } from './Inputs.js';
import { Radar } from './Radar.js';
import { Relative } from './Relative.js';
import { Standings } from './Standings.js';

export const WIDGET_TITLES: Record<WidgetId, string> = {
  relative: 'Relative',
  standings: 'Classificação',
  delta: 'Delta',
  inputs: 'Pedais',
  fuel: 'Combustível',
  radar: 'Radar',
  flag: 'Bandeira',
};

/**
 * Com que frequência cada widget pergunta o quadro. Ritmo de tela: o delta e o
 * radar mudam a cada tick que importa; a classificação, a cada volta.
 */
const INTERVAL_MS: Record<Exclude<WidgetId, 'inputs'>, number> = {
  relative: 100,
  standings: 250,
  delta: 33,
  fuel: 500,
  radar: 50,
  flag: 200,
};

/** Tamanho do quadro de posicionamento quando não há sessão, para arrastar para o lugar. */
const PLACEHOLDER_SIZE: Record<WidgetId, { width: number; height: number }> = {
  relative: { width: 400, height: 190 },
  standings: { width: 520, height: 300 },
  delta: { width: 340, height: 78 },
  inputs: { width: 380, height: 96 },
  fuel: { width: 240, height: 150 },
  radar: { width: 136, height: 236 },
  flag: { width: 240, height: 44 },
};

/**
 * Uma janela do overlay: um widget, transparente, por cima do sim (ADR 0025).
 *
 * Sem sessão no sim, não desenha nada. Destravada para mover, mostra moldura,
 * nome e a escala — e, sem sessão, um quadro do tamanho aproximado do widget
 * para o piloto arrastar para o lugar antes de entrar no carro.
 */
export function OverlayRoot({ widget }: { widget: WidgetId }) {
  const settings = useOverlaySettings();
  const root = useRef<HTMLDivElement>(null);
  useFitWindow(root);

  const editing = settings?.editing ?? false;
  const style = {
    '--ov-alpha': settings?.backgroundOpacity ?? 0.82,
  } as CSSProperties;

  return (
    <div ref={root} className={`ov${editing ? ' ov--editing' : ''}`} style={style}>
      {editing && settings !== null && <EditBar widget={widget} settings={settings} />}
      {settings !== null &&
        (widget === 'inputs' ? (
          <Inputs settings={settings} editing={editing} />
        ) : (
          <FrameWidget widget={widget} settings={settings} editing={editing} />
        ))}
    </div>
  );
}

function FrameWidget({
  widget,
  settings,
  editing,
}: {
  widget: Exclude<WidgetId, 'inputs'>;
  settings: OverlaySettings;
  editing: boolean;
}) {
  const frame = useOverlayFrame(widget, INTERVAL_MS[widget]);
  if (frame.state !== 'connected') {
    return editing ? <Placeholder widget={widget} /> : null;
  }

  let body: ReactNode;
  switch (widget) {
    case 'relative':
      body = <Relative frame={frame} settings={settings} />;
      break;
    case 'standings':
      body = <Standings frame={frame} settings={settings} />;
      break;
    case 'delta':
      body = <DeltaBar frame={frame} settings={settings} />;
      break;
    case 'fuel':
      body = <Fuel frame={frame} />;
      break;
    case 'radar':
      body = <Radar frame={frame} settings={settings} editing={editing} />;
      break;
    case 'flag':
      body = <FlagBanner frame={frame} editing={editing} />;
      break;
  }
  return body;
}

function Placeholder({ widget }: { widget: WidgetId }) {
  return (
    <div className="ov-panel ov-placeholder" style={PLACEHOLDER_SIZE[widget]}>
      {WIDGET_TITLES[widget]}
      <small>aparece quando houver sessão no sim</small>
    </div>
  );
}

const SCALES = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];

function EditBar({ widget, settings }: { widget: WidgetId; settings: OverlaySettings }) {
  const scale = settings.widgets[widget].scale;
  const change = (direction: 1 | -1) => {
    const next =
      direction > 0
        ? (SCALES.find((s) => s > scale + 0.001) ?? scale)
        : ([...SCALES].reverse().find((s) => s < scale - 0.001) ?? scale);
    void bridge().updateOverlaySettings({ widgets: { [widget]: { scale: next } } });
  };
  return (
    <div className="ov-edit">
      <span className="ov-edit__title">{WIDGET_TITLES[widget]}</span>
      <button type="button" onClick={() => change(-1)} aria-label="Diminuir">
        −
      </button>
      <span className="ov-edit__scale">{Math.round(scale * 100)}%</span>
      <button type="button" onClick={() => change(1)} aria-label="Aumentar">
        +
      </button>
    </div>
  );
}
