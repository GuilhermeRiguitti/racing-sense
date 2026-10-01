import type { ReactNode } from 'react';
import {
  DEFAULT_OVERLAY_SETTINGS,
  type DeltaReference,
  type OverlaySettings,
  type OverlaySettingsPatch,
  WIDGET_IDS,
  type WidgetId,
} from '../../shared/overlay.js';
import { bridge } from './bridge.js';
import { OverlayLock } from './OverlayLock.js';
import { useOverlaySettings } from './overlay/hooks.js';
import { WIDGET_TITLES } from './overlay/OverlayRoot.js';

const WIDGET_HINTS: Record<WidgetId, string> = {
  relative: 'Quem está perto de você na pista, com o gap do sim.',
  standings: 'A classificação por classe: o topo e os seus vizinhos.',
  delta: 'O delta do sim contra a referência escolhida, e os tempos da volta.',
  inputs: 'Acelerador e freio dos últimos segundos, marcha e velocidade.',
  fuel: 'Tanque, consumo por volta medido na stint e quanto pôr no box.',
  radar: 'Carros por perto e o aviso de carro ao lado. Some quando não há ninguém.',
  flag: 'A bandeira acesa para você. Some quando não há bandeira.',
};

/**
 * "De todas" é o arquivo de melhor volta que o iRacing guarda por carro e pista,
 * entre sessões — não a melhor volta de hoje.
 */
const DELTA_OPTIONS: readonly { value: DeltaReference; label: string }[] = [
  { value: 'session-best', label: 'Sua melhor volta nesta sessão' },
  { value: 'session-optimal', label: 'Sua volta ideal nesta sessão' },
  { value: 'session-last', label: 'Sua última volta' },
  { value: 'best', label: 'Sua melhor volta de todas (guardada pelo iRacing)' },
  { value: 'optimal', label: 'Sua volta ideal de todas (guardada pelo iRacing)' },
];

const update = (patch: OverlaySettingsPatch) => void bridge().updateOverlaySettings(patch);

/**
 * Onde o piloto liga, desliga, arruma e ajusta o overlay (ADR 0025).
 *
 * Cada mudança vale na hora: as janelas recebem o aviso e se redesenham.
 */
export function OverlaySettingsView() {
  const settings = useOverlaySettings();
  if (settings === null) return <p className="muted">Carregando o overlay…</p>;

  const resetPositions = () =>
    update({
      widgets: Object.fromEntries(WIDGET_IDS.map((id) => [id, { x: null, y: null, scale: 1 }])),
    });

  return (
    <section className="overlay-settings">
      <header className="session-header">
        <h1 className="session-header__track">Overlay</h1>
        <p className="session-header__meta">
          Janelas por cima do sim, com o que ele entrega ao vivo. Só leitura: o app nunca manda
          nada para o iRacing.
        </p>
      </header>

      <div className="overlay-settings__actions">
        <label className="overlay-settings__switch">
          <input
            type="checkbox"
            checked={settings.visible}
            onChange={(event) => update({ visible: event.target.checked })}
          />
          Overlay ligado
        </label>
        <OverlayLock settings={settings} />
        <button type="button" className="button" onClick={resetPositions}>
          Restaurar posições
        </button>
      </div>
      {settings.editing && (
        <p className="overlay-settings__hint">
          Arraste cada janela para onde quiser — clique em qualquer ponto dela e arraste — e use −
          e + para a escala. Feche o cadeado quando terminar: travado, nada se move, e o clique
          atravessa o overlay e vai para o sim.
        </p>
      )}
      <p className="muted overlay-settings__note">
        Rode o iRacing em janela ou janela sem borda. Em tela cheia exclusiva o sim cobre qualquer
        janela, e o overlay não aparece. Em VR, também não.
      </p>

      <h2 className="overlay-settings__title">Widgets</h2>
      <ul className="overlay-settings__widgets">
        {WIDGET_IDS.map((id) => (
          <li key={id}>
            <label>
              <input
                type="checkbox"
                checked={settings.widgets[id].enabled}
                onChange={(event) => update({ widgets: { [id]: { enabled: event.target.checked } } })}
              />
              <span>
                <strong>{WIDGET_TITLES[id]}</strong>
                <span className="muted">{WIDGET_HINTS[id]}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <h2 className="overlay-settings__title">Aparência</h2>
      <Field label="Fundo">
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={settings.backgroundOpacity}
          onChange={(event) => update({ backgroundOpacity: Number(event.target.value) })}
        />
        <span className="muted">{Math.round(settings.backgroundOpacity * 100)}%</span>
      </Field>

      <h2 className="overlay-settings__title">Relative</h2>
      <Field label="Carros à frente">
        <NumberInput
          value={settings.relative.carsAhead}
          min={0}
          max={10}
          onChange={(value) => update({ relative: { carsAhead: value } })}
        />
      </Field>
      <Field label="Carros atrás">
        <NumberInput
          value={settings.relative.carsBehind}
          min={0}
          max={10}
          onChange={(value) => update({ relative: { carsBehind: value } })}
        />
      </Field>
      <Columns
        settings={settings}
        section="relative"
        options={[
          ['carNumber', 'Número'],
          ['make', 'Marca'],
          ['license', 'Carteira e SR'],
          ['iRating', 'iRating'],
        ]}
      />

      <h2 className="overlay-settings__title">Classificação</h2>
      <Field label="Do topo">
        <NumberInput
          value={settings.standings.leaders}
          min={1}
          max={20}
          onChange={(value) => update({ standings: { leaders: value } })}
        />
      </Field>
      <Field label="À sua volta">
        <NumberInput
          value={settings.standings.aroundPlayer}
          min={0}
          max={10}
          onChange={(value) => update({ standings: { aroundPlayer: value } })}
        />
      </Field>
      <Field label="Outras classes">
        <NumberInput
          value={settings.standings.otherClasses}
          min={0}
          max={20}
          onChange={(value) => update({ standings: { otherClasses: value } })}
        />
      </Field>
      <Columns
        settings={settings}
        section="standings"
        options={[
          ['carNumber', 'Número'],
          ['make', 'Marca'],
          ['license', 'Carteira e SR'],
          ['iRating', 'iRating'],
          ['lastLap', 'Última volta'],
          ['bestLap', 'Melhor volta'],
          ['gap', 'Gap para o líder'],
          ['interval', 'Intervalo'],
        ]}
      />
      <p className="muted overlay-settings__note">
        Marca e cor de classe só aparecem quando distinguem alguém: num grid de um fabricante só,
        a coluna some sozinha.
      </p>

      <h2 className="overlay-settings__title">Delta, pedais e radar</h2>
      <Field label="Delta contra">
        <select
          value={settings.delta.reference}
          onChange={(event) => update({ delta: { reference: event.target.value as DeltaReference } })}
        >
          {DELTA_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Pedais, segundos">
        <NumberInput
          value={settings.inputs.seconds}
          min={2}
          max={20}
          onChange={(value) => update({ inputs: { seconds: value } })}
        />
      </Field>
      <Field label="Radar, metros">
        <NumberInput
          value={settings.radar.rangeMeters}
          min={10}
          max={200}
          onChange={(value) => update({ radar: { rangeMeters: value } })}
        />
      </Field>

      <p className="overlay-settings__footer">
        <button type="button" className="button" onClick={() => update(DEFAULT_OVERLAY_SETTINGS)}>
          Voltar ao padrão
        </button>
      </p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="overlay-settings__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
    />
  );
}

function Columns<S extends 'relative' | 'standings'>({
  settings,
  section,
  options,
}: {
  settings: OverlaySettings;
  section: S;
  options: readonly (readonly [keyof OverlaySettings[S]['columns'] & string, string])[];
}) {
  const columns = settings[section].columns as unknown as Record<string, boolean>;
  return (
    <div className="overlay-settings__columns">
      {options.map(([key, label]) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={columns[key] ?? false}
            onChange={(event) => update({ [section]: { columns: { [key]: event.target.checked } } })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
