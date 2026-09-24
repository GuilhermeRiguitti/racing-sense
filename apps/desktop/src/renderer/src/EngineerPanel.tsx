import type { LapDto, SeriesDto, SessionDto } from '../../shared/dto.js';
import { duasCasas, formatoLivre, inteiro, umaCasa } from './channels.js';
import { formatDistance } from './chart-math.js';
import {
  adjustmentReadings,
  dynamicsReading,
  fuelReading,
  type TireReading,
  tireReadings,
} from './engineer.js';

interface Props {
  readonly session: SessionDto;
  readonly lap: LapDto;
  readonly series: readonly SeriesDto[];
  readonly cursor: number | null;
}

const ou = (valor: number | null, formato: (v: number) => string, unidade: string) =>
  valor === null ? '—' : `${formato(valor)} ${unidade}`.trim();

const comSinal = (valor: number) => `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${umaCasa(Math.abs(valor))}`;

/**
 * A coluna do engenheiro: o que a volta fez com o carro.
 *
 * Pneu, combustível, ajustes de dentro do carro, dinâmica e motor, em números.
 * Com o cursor sobre o gráfico, a leitura do pneu passa a ser daquele ponto da
 * pista; fora dele, é a média da volta. Cada cartão diz qual das duas está
 * mostrando, para ninguém comparar um pico com uma média sem saber.
 */
export function EngineerPanel({ session, lap, series, cursor }: Props) {
  const pneus = tireReadings(series, cursor);
  const combustivel = fuelReading(series, lap);
  const ajustes = adjustmentReadings(series, session.channels);
  const dinamica = dynamicsReading(series);
  const temPneu = pneus.some((p) => p.source !== null || p.pressureKpa !== null);
  const onde =
    cursor === null ? 'média da volta' : `em ${formatDistance(cursor, session.trackLengthMeters)}`;
  const fonte = pneus.find((p) => p.source !== null)?.source;

  return (
    <aside className="engineer" aria-label="Leitura do engenheiro">
      <section className="card">
        <header className="card__header">
          <h3 className="card__title">Pneus</h3>
          <span className="card__meta">
            {fonte === 'carcass' ? 'carcaça' : fonte === 'surface' ? 'superfície' : ''}
            {fonte !== undefined && ' · '}
            {onde}
          </span>
        </header>
        {temPneu ? (
          <div className="tires">
            {pneus.map((pneu) => (
              <Pneu key={pneu.corner.prefix} pneu={pneu} />
            ))}
          </div>
        ) : (
          <p className="card__empty">Esta volta não tem canal de pneu gravado.</p>
        )}
      </section>

      {combustivel !== null && (
        <section className="card">
          <header className="card__header">
            <h3 className="card__title">Combustível</h3>
          </header>
          <dl className="facts">
            <Fato
              rotulo="Gasto na volta"
              valor={
                combustivel.refueled
                  ? 'abasteceu'
                  : ou(combustivel.usedLiters, duasCasas, 'l')
              }
            />
            <Fato rotulo="No tanque" valor={ou(combustivel.remainingLiters, duasCasas, 'l')} />
            <Fato
              rotulo="Voltas no tanque"
              valor={ou(combustivel.lapsRemaining, umaCasa, '')}
              nota={combustivel.lapsRemaining !== null ? 'no consumo desta volta' : undefined}
            />
            {session.carLimits.fuelCapacityLiters !== null && (
              <Fato
                rotulo="Capacidade"
                valor={ou(session.carLimits.fuelCapacityLiters, inteiro, 'l')}
              />
            )}
          </dl>
        </section>
      )}

      {ajustes.length > 0 && (
        <section className="card">
          <header className="card__header">
            <h3 className="card__title">Ajustes no carro</h3>
            <span className="card__meta">nesta volta</span>
          </header>
          <dl className="facts">
            {ajustes.map((ajuste) => (
              <Fato
                key={ajuste.channel}
                rotulo={ajuste.label}
                valor={
                  ajuste.changed
                    ? `${formatoLivre(ajuste.first)} → ${formatoLivre(ajuste.last)}`
                    : formatoLivre(ajuste.last)
                }
                nota={ajuste.changed ? 'mexeu nesta volta' : undefined}
              />
            ))}
          </dl>
        </section>
      )}

      <section className="card">
        <header className="card__header">
          <h3 className="card__title">Carro na volta</h3>
        </header>
        <dl className="facts">
          <Fato rotulo="Pico lateral" valor={ou(dinamica.peakLateralG, duasCasas, 'g')} />
          <Fato rotulo="Pico de frenagem" valor={ou(dinamica.peakBrakingG, duasCasas, 'g')} />
          {dinamica.absActivePct !== null && (
            <Fato rotulo="ABS atuando" valor={`${inteiro(dinamica.absActivePct)}% da volta`} />
          )}
          <Fato rotulo="Água, máxima" valor={ou(dinamica.maxWaterC, umaCasa, '°C')} />
          <Fato rotulo="Óleo, máxima" valor={ou(dinamica.maxOilC, umaCasa, '°C')} />
          <Fato rotulo="Pressão do óleo, mínima" valor={ou(dinamica.minOilPressBar, duasCasas, 'bar')} />
        </dl>
      </section>
    </aside>
  );
}

function Fato({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string | undefined }) {
  return (
    <div className="facts__item">
      <dt>{rotulo}</dt>
      <dd>
        {valor}
        {nota !== undefined && <span className="facts__note">{nota}</span>}
      </dd>
    </div>
  );
}

/**
 * Um pneu visto de cima: as três faixas lado a lado, na posição real.
 *
 * A marca colorida ao lado do nome da roda é a mesma cor da linha dela nos
 * gráficos — o texto fica na cor de texto, a identidade vem da marca.
 */
function Pneu({ pneu }: { pneu: TireReading }) {
  return (
    <div className="tire">
      <div className="tire__name">
        <svg width="10" height="10" aria-hidden="true">
          <rect width="10" height="10" rx="2" className={`fill-${pneu.corner.slot}`} />
        </svg>
        <span title={pneu.corner.name}>{pneu.corner.label}</span>
      </div>
      <div className="tire__bands">
        {pneu.bands.map((faixa) => (
          <div key={faixa.position} className="tire__band">
            <span className="tire__band-label">{faixa.position}</span>
            <strong>{faixa.celsius === null ? '—' : inteiro(faixa.celsius)}</strong>
          </div>
        ))}
      </div>
      <div className="tire__facts">
        <span>{ou(pneu.pressureKpa, umaCasa, 'kPa')}</span>
        {pneu.innerMinusOuter !== null && (
          <span title="Interna menos externa">int−ext {comSinal(pneu.innerMinusOuter)} °C</span>
        )}
        {pneu.middleMinusEdges !== null && (
          <span title="Meio menos a média das bordas">meio−bordas {comSinal(pneu.middleMinusEdges)} °C</span>
        )}
        {pneu.wearPct !== null && (
          <span title="Borracha restante ao fim da volta, externa/meio/interna na ordem vista de cima">
            restante {pneu.wearPct.map((w) => (w === null ? '—' : inteiro(w))).join('/')}%
          </span>
        )}
      </div>
    </div>
  );
}
