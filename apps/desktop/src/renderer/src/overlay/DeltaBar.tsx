import type { DeltaReference, OverlaySettings } from '../../../shared/overlay.js';
import type { ConnectedFrame } from './ConnectedFrame.js';
import { delta, lapTime } from './format.js';

/**
 * Até onde a barra vai, em segundos, para cada lado. É a escala do desenho, não
 * um limiar de análise: além dela a barra fica cheia e o número continua exato.
 */
const BAR_RANGE_SECONDS = 2;

const REFERENCE_LABEL: Record<DeltaReference, string> = {
  best: 'sua melhor volta de todas',
  optimal: 'sua volta ideal de todas',
  'session-best': 'sua melhor volta na sessão',
  'session-optimal': 'sua volta ideal na sessão',
  'session-last': 'sua última volta',
};

/**
 * O delta que o próprio sim calcula contra a referência escolhida: azul quando o
 * piloto está ganhando tempo, vermelho quando está perdendo — as cores do delta
 * da tela de análise. Sem valor válido (o sim diz que não vale), a barra some e
 * fica o traço.
 */
export function DeltaBar({ frame, settings }: { frame: ConnectedFrame; settings: OverlaySettings }) {
  const reference = settings.delta.reference;
  const value = frame.player?.delta[reference] ?? null;
  const fraction = value === null ? 0 : Math.max(-1, Math.min(1, value / BAR_RANGE_SECONDS));
  const tone = value === null ? '' : value < 0 ? 'is-gain' : value > 0 ? 'is-loss' : '';

  return (
    <div className="ov-panel ov-delta">
      <div className="ov-delta__bar" aria-hidden="true">
        <span className="ov-delta__zero" />
        {value !== null && (
          <span
            className={`ov-delta__fill ${tone}`}
            style={
              fraction < 0
                ? { right: '50%', width: `${-fraction * 50}%` }
                : { left: '50%', width: `${fraction * 50}%` }
            }
          />
        )}
      </div>
      <div className="ov-delta__numbers">
        <span className={`ov-delta__value ${tone}`}>{delta(value)}</span>
        <span className="ov-delta__times">
          <span>
            <em>Volta</em> {lapTime(frame.player?.currentLapTime ?? null)}
          </span>
          <span>
            <em>Última</em> {lapTime(frame.player?.lastLapTime ?? null)}
          </span>
          <span>
            <em>Melhor</em> {lapTime(frame.player?.bestLapTime ?? null)}
          </span>
        </span>
      </div>
      <div className="ov-delta__reference">contra {REFERENCE_LABEL[reference]}</div>
    </div>
  );
}
