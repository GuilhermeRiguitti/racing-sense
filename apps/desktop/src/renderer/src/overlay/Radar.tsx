import type { OverlaySettings, SideDto } from '../../../shared/overlay.js';
import type { ConnectedFrame } from './ConnectedFrame.js';

const WIDTH = 120;
const HEIGHT = 220;
/**
 * O comprimento do desenho de um carro, em metros. É só o tamanho do retângulo
 * na tela (um GT3 tem ~4,6 m); a distância dos outros carros é a medida.
 */
const CAR_LENGTH_M = 4.6;
const CAR_WIDTH_PX = 22;

const LEFT: readonly SideDto[] = ['left', 'both', 'two-left'];
const RIGHT: readonly SideDto[] = ['right', 'both', 'two-right'];

/**
 * Quem está perto, à frente e atrás, e de que lado há carro.
 *
 * O SDK não dá a posição lateral dos outros carros (ADR 0025): a distância na
 * pista vem de `CarIdxLapDistPct`, e o lado vem do "spotter" do sim
 * (`CarLeftRight`). Por isso os carros à frente e atrás são desenhados na faixa
 * do piloto, e o carro ao lado aparece na faixa do lado que o sim avisou.
 *
 * Sem ninguém no alcance e sem aviso de lado, o widget some.
 */
export function Radar({
  frame,
  settings,
  editing,
}: {
  frame: ConnectedFrame;
  settings: OverlaySettings;
  editing: boolean;
}) {
  const range = settings.radar.rangeMeters;
  const player = frame.player;
  const side = player?.side ?? null;
  const near = (player?.nearby ?? []).filter((car) => Math.abs(car.meters) <= range);
  const left = side !== null && LEFT.includes(side);
  const right = side !== null && RIGHT.includes(side);
  if (!editing && near.length === 0 && !left && !right) return null;

  const scale = HEIGHT / 2 / range;
  const carHeight = Math.max(8, CAR_LENGTH_M * scale);
  const center = WIDTH / 2;
  const lane = CAR_WIDTH_PX + 8;
  const yOf = (meters: number) => HEIGHT / 2 - meters * scale - carHeight / 2;

  return (
    <div className="ov-panel ov-radar">
      <svg width={WIDTH} height={HEIGHT} role="img" aria-label="Carros por perto">
        {left && <rect className="ov-radar__warn" x={0} y={0} width={center - lane / 2} height={HEIGHT} />}
        {right && (
          <rect
            className="ov-radar__warn"
            x={center + lane / 2}
            y={0}
            width={WIDTH - center - lane / 2}
            height={HEIGHT}
          />
        )}
        <line className="ov-radar__axis" x1={0} x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} />
        {near.map((car) => (
          <rect
            key={car.carIdx}
            className="ov-radar__car"
            x={center - CAR_WIDTH_PX / 2}
            y={yOf(car.meters)}
            width={CAR_WIDTH_PX}
            height={carHeight}
            rx={4}
          />
        ))}
        {left && (
          <rect
            className="ov-radar__car is-alongside"
            x={center - lane - CAR_WIDTH_PX / 2}
            y={yOf(0)}
            width={CAR_WIDTH_PX}
            height={carHeight}
            rx={4}
          />
        )}
        {right && (
          <rect
            className="ov-radar__car is-alongside"
            x={center + lane - CAR_WIDTH_PX / 2}
            y={yOf(0)}
            width={CAR_WIDTH_PX}
            height={carHeight}
            rx={4}
          />
        )}
        <rect
          className="ov-radar__player"
          x={center - CAR_WIDTH_PX / 2}
          y={yOf(0)}
          width={CAR_WIDTH_PX}
          height={carHeight}
          rx={4}
        />
      </svg>
    </div>
  );
}
