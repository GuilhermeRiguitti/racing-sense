import type { SessionDto } from '@telemetry/contracts';

const TIPO: Record<string, string> = {
  Practice: 'Treino',
  'Open Qualify': 'Classificação',
  'Lone Qualify': 'Classificação',
  Qualify: 'Classificação',
  Race: 'Corrida',
  'Offline Testing': 'Teste',
};

const horario = (segundos: number | null) => {
  if (segundos === null) return null;
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
};

const grau = (valor: number | null) => (valor === null ? null : `${valor.toFixed(0)} °C`);

/**
 * Pista, carro e condições da sessão.
 *
 * As condições ficam no topo, visíveis sempre: tempo de volta sem temperatura
 * de pista é número honesto e conclusão errada (regra 19).
 */
export function SessionHeader({ session }: { session: SessionDto }) {
  const c = session.conditions;
  const condicoes: [string, string | null][] = [
    ['Pista', grau(c.trackTempCelsius)],
    ['Ar', grau(c.airTempCelsius)],
    ['Horário', horario(c.timeOfDaySeconds)],
    ['Umidade', c.relativeHumidityPct === null ? null : `${Math.round(c.relativeHumidityPct)}%`],
    ['Céu', c.skies],
    ['Borracha', c.trackUsage],
  ];

  return (
    <header className="session-header">
      <h1 className="session-header__track">
        {session.trackName}
        {session.trackConfig !== null && (
          <span className="session-header__config"> · {session.trackConfig}</span>
        )}
      </h1>
      <p className="session-header__meta">
        {session.carName}
        {session.sessionType !== null && ` · ${TIPO[session.sessionType] ?? session.sessionType}`}
      </p>
      <dl className="conditions">
        {condicoes
          .filter((par): par is [string, string] => par[1] !== null)
          .map(([rotulo, valor]) => (
            <div key={rotulo} className="conditions__item">
              <dt>{rotulo}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
      </dl>
    </header>
  );
}
