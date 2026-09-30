import type { OverlaySettings } from '../../shared/overlay.js';
import { bridge } from './bridge.js';

/**
 * O cadeado do overlay. Fechado, as janelas não se movem e o clique atravessa
 * para o sim. Aberto, cada janela pode ser arrastada para onde o piloto quiser;
 * fechar de novo grava as posições.
 */
export function OverlayLock({
  settings,
  compact = false,
}: {
  settings: OverlaySettings;
  compact?: boolean;
}) {
  const unlocked = settings.editing;
  const disabled = !settings.visible;
  const label = unlocked ? 'Overlay destravado' : 'Overlay travado';
  const hint = disabled
    ? 'Ligue o overlay para posicionar'
    : unlocked
      ? 'Arraste as janelas; clique para travar'
      : 'Clique para destravar e arrastar';

  return (
    <button
      type="button"
      className={`overlay-lock${unlocked ? ' is-unlocked' : ''}${compact ? ' is-compact' : ''}`}
      aria-pressed={unlocked}
      disabled={disabled}
      title={hint}
      onClick={() => void bridge().updateOverlaySettings({ editing: !unlocked })}
    >
      <PadlockIcon open={unlocked} />
      <span className="overlay-lock__text">
        <span className="overlay-lock__label">{label}</span>
        {!compact && <span className="overlay-lock__hint">{hint}</span>}
      </span>
    </button>
  );
}

function PadlockIcon({ open }: { open: boolean }) {
  return (
    <svg className="overlay-lock__icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="10.5" width="16" height="11" rx="2.5" fill="currentColor" />
      <path
        d={open ? 'M8 10.5V7a4 4 0 0 1 7.6-1.7' : 'M8 10.5V7a4 4 0 0 1 8 0v3.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
