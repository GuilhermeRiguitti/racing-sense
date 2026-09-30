import type { ConnectedFrame } from './ConnectedFrame.js';
import { laps, liters } from './format.js';

/**
 * Quanto tem, quanto gasta, quanto falta. O gasto é medido de linha a linha,
 * na média da stint (ver `domain/fuel-usage.ts`); as voltas que faltam são as
 * do sim. Enquanto nenhuma volta limpa foi medida, o widget diz isso em vez de
 * inventar um consumo.
 */
export function Fuel({ frame }: { frame: ConnectedFrame }) {
  const fuel = frame.player?.fuel ?? null;
  if (fuel === null) {
    return (
      <div className="ov-panel ov-fuel">
        <div className="ov-head">
          <span>Combustível</span>
        </div>
        <p className="ov-note">O sim não entrega o nível do tanque neste carro.</p>
      </div>
    );
  }

  const measuring = fuel.measuredLaps === 0;
  return (
    <div className="ov-panel ov-fuel">
      <div className="ov-head">
        <span>Combustível</span>
        <span className="ov-head__clock">
          {measuring ? 'medindo…' : `${fuel.measuredLaps} volta${fuel.measuredLaps > 1 ? 's' : ''}`}
        </span>
      </div>
      <dl className="ov-stats">
        <dt>No tanque</dt>
        <dd>
          {liters(fuel.fuelLevel)}
          {fuel.capacityLiters !== null && (
            <span className="ov-muted"> de {liters(fuel.capacityLiters, 0)}</span>
          )}
        </dd>
        <dt>Por volta</dt>
        <dd>
          {liters(fuel.averageUsage, 2)}
          {fuel.lastLapUsage !== null && (
            <span className="ov-muted"> última {liters(fuel.lastLapUsage, 2)}</span>
          )}
        </dd>
        <dt>Rende</dt>
        <dd>{fuel.lapsOfFuel === null ? '—' : `${laps(fuel.lapsOfFuel)} voltas`}</dd>
        <dt>Faltam</dt>
        <dd>{fuel.lapsRemaining === null ? '—' : `${fuel.lapsRemaining} voltas`}</dd>
        <dt>Pôr no box</dt>
        <dd className={fuel.fuelToFinish !== null && fuel.fuelToFinish > 0 ? 'is-alert' : ''}>
          {liters(fuel.fuelToFinish)}
        </dd>
      </dl>
    </div>
  );
}
