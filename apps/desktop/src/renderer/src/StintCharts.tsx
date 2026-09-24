import { useEffect, useRef, useState } from 'react';
import type { ChannelDto, LapDto, StintLapDto } from '../../shared/dto.js';
import { CORNERS, duasCasas, formatoLivre, type Slot, umaCasa } from './channels.js';
import { formatLapTime, niceTicks } from './chart-math.js';
import { adjustmentTimeline, perLap } from './engineer.js';

interface Props {
  readonly stint: readonly StintLapDto[];
  readonly channels: readonly ChannelDto[];
  readonly selected: number | null;
  readonly onSelect: (lapNumber: number) => void;
}

interface Serie {
  readonly id: string;
  readonly label: string;
  readonly slot: Slot;
  readonly values: readonly (number | null)[];
}

/**
 * A sessão volta a volta — o que o engenheiro acompanha no muro dos boxes.
 *
 * Pequenos múltiplos com o mesmo eixo X (a volta), cada um com o seu eixo Y:
 * tempo, pressão, temperatura e combustível não dividem escala. Clicar numa
 * volta a abre embaixo. A tabela de voltas ao lado é a versão em texto destes
 * gráficos, então nenhum valor depende só do passar do mouse.
 */
export function StintCharts({ stint, channels, selected, onSelect }: Props) {
  const [foco, setFoco] = useState<number | null>(null);
  const laps = stint.map((s) => s.lap);

  const porRoda = (medida: string): Serie[] =>
    CORNERS.map((roda) => ({
      id: roda.prefix,
      label: roda.label,
      slot: roda.slot,
      values: perLap(stint, `${roda.prefix}${medida}`, 'mean'),
    })).filter((serie) => serie.values.some((v) => v !== null));

  const temperatura = porRoda('tempM');
  const graficos = [
    {
      id: 'laptime',
      title: 'Tempo de volta',
      unit: '',
      format: formatLapTime,
      // Marcação do eixo sem os milésimos que não dizem nada: 1:44.5, não 1:44.500.
      tickFormat: (v: number) => formatLapTime(v).replace(/\.?0+$/, ''),
      series: [
        { id: 'time', label: 'Tempo', slot: 1 as const, values: laps.map((l) => l.lapTimeSeconds) },
      ],
      marcaInvalida: true,
    },
    {
      id: 'pressure',
      title: 'Pressão média do pneu',
      unit: 'kPa',
      format: umaCasa,
      series: porRoda('pressure'),
    },
    {
      id: 'temp',
      title:
        temperatura.length > 0 ? 'Temperatura média · centro da banda' : 'Temperatura média · carcaça',
      unit: '°C',
      format: umaCasa,
      series: temperatura.length > 0 ? temperatura : porRoda('tempCM'),
    },
    {
      id: 'fuel',
      title: 'Combustível ao fim da volta',
      unit: 'l',
      format: duasCasas,
      series: [
        { id: 'fuel', label: 'Tanque', slot: 1 as const, values: perLap(stint, 'FuelLevel', 'last') },
      ],
    },
  ].filter((g) => g.series.some((s) => s.values.some((v) => v !== null)));

  const mudancas = adjustmentTimeline(stint, channels);

  if (stint.length === 0) return null;

  return (
    <section className="stint" aria-label="A sessão volta a volta">
      <div className="stint__grid">
        {graficos.map((grafico) => (
          <Tendencia
            key={grafico.id}
            titulo={grafico.title}
            unidade={grafico.unit}
            formato={grafico.format}
            formatoEixo={'tickFormat' in grafico ? grafico.tickFormat : grafico.format}
            series={grafico.series}
            laps={laps}
            selecionada={selected}
            foco={foco}
            onFoco={setFoco}
            onSelect={onSelect}
            marcaInvalida={grafico.marcaInvalida === true}
          />
        ))}
      </div>
      {mudancas.length > 0 && (
        <div className="stint__changes">
          <h3 className="card__title">Ajustes mexidos na sessão</h3>
          <ul>
            {mudancas.map((m) => (
              <li key={`${m.lapNumber}-${m.label}-${m.when}-${m.from}`}>
                <span className="stint__change-lap">Volta {m.lapNumber}</span>
                {m.label}: {formatoLivre(m.from)} → {formatoLivre(m.to)}
                {m.unit !== '' && ` ${m.unit}`}
                <span className="facts__note">
                  {m.when === 'during-lap' ? 'na pista' : 'entre voltas'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const MARGEM_ESQUERDA = 48;
const MARGEM_DIREITA = 12;
const ALTURA = 110;

function Tendencia({
  titulo,
  unidade,
  formato,
  formatoEixo,
  series,
  laps,
  selecionada,
  foco,
  onFoco,
  onSelect,
  marcaInvalida,
}: {
  titulo: string;
  unidade: string;
  formato: (valor: number) => string;
  formatoEixo: (valor: number) => string;
  series: readonly Serie[];
  laps: readonly LapDto[];
  selecionada: number | null;
  foco: number | null;
  onFoco: (indice: number | null) => void;
  onSelect: (lapNumber: number) => void;
  marcaInvalida: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    const elemento = caixa.current;
    if (elemento === null) return;
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada !== undefined) setLargura(entrada.contentRect.width);
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const valores = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const [baixo, alto] = minimo === maximo ? [minimo - 1, maximo + 1] : [minimo, maximo];
  const ticks = niceTicks(baixo, alto, 3).filter((t) => t >= baixo && t <= alto);

  const larguraPlot = Math.max(0, largura - MARGEM_ESQUERDA - MARGEM_DIREITA);
  const passo = laps.length > 1 ? larguraPlot / (laps.length - 1) : 0;
  const px = (indice: number) =>
    MARGEM_ESQUERDA + (laps.length > 1 ? indice * passo : larguraPlot / 2);
  const topo = 8;
  const base = ALTURA - 8;
  const py = (valor: number) => base - ((valor - baixo) / (alto - baixo || 1)) * (base - topo);

  const indiceDoPonteiro = (clientX: number, esquerda: number) => {
    if (laps.length === 0) return null;
    if (laps.length === 1) return 0;
    const indice = Math.round((clientX - esquerda - MARGEM_ESQUERDA) / passo);
    return Math.min(laps.length - 1, Math.max(0, indice));
  };

  const indiceSelecionado = laps.findIndex((l) => l.number === selecionada);
  const leitura = foco ?? (indiceSelecionado >= 0 ? indiceSelecionado : null);
  const voltaLida = leitura === null ? undefined : laps[leitura];

  return (
    <div className="trend">
      <div className="trend__header">
        <span className="panel__title">{titulo}</span>
        <span className="panel__values">
          {voltaLida !== undefined && <span className="panel__label">Volta {voltaLida.number}</span>}
          {series.map((serie) => {
            const valor = leitura === null ? null : (serie.values[leitura] ?? null);
            return (
              <span key={serie.id} className="panel__value">
                {series.length > 1 && (
                  <>
                    <svg className="panel__key" width="14" height="8" aria-hidden="true">
                      <line x1="1" y1="4" x2="13" y2="4" className={`stroke-${serie.slot}`} />
                    </svg>
                    <span className="panel__label">{serie.label}</span>
                  </>
                )}
                <strong>{valor === null ? '—' : formato(valor)}</strong>
                {unidade !== '' && <span className="panel__unit">{unidade}</span>}
              </span>
            );
          })}
        </span>
      </div>
      <div
        ref={caixa}
        className="trend__plot"
        onPointerMove={(e) =>
          onFoco(indiceDoPonteiro(e.clientX, e.currentTarget.getBoundingClientRect().left))
        }
        onPointerLeave={() => onFoco(null)}
        onClick={(e) => {
          const indice = indiceDoPonteiro(e.clientX, e.currentTarget.getBoundingClientRect().left);
          const volta = indice === null ? undefined : laps[indice];
          if (volta !== undefined) onSelect(volta.number);
        }}
      >
        {largura > 0 && valores.length > 0 && (
          <svg width={largura} height={ALTURA} aria-hidden="true">
            {indiceSelecionado >= 0 && (
              <rect
                x={px(indiceSelecionado) - Math.max(6, passo / 2)}
                y={0}
                width={Math.max(12, passo)}
                height={ALTURA}
                className="trend__selected"
              />
            )}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGEM_ESQUERDA}
                  x2={largura - MARGEM_DIREITA}
                  y1={py(tick)}
                  y2={py(tick)}
                  className="grid"
                />
                <text x={MARGEM_ESQUERDA - 6} y={py(tick)} className="tick tick--y">
                  {formatoEixo(tick)}
                </text>
              </g>
            ))}
            {series.map((serie) => (
              <g key={serie.id}>
                <path d={caminho(serie.values, px, py)} className={`series stroke-${serie.slot}`} />
                {serie.values.map((valor, indice) => {
                  if (valor === null) return null;
                  const volta = laps[indice];
                  const valida = volta !== undefined && volta.flags.length === 0;
                  return (
                    <circle
                      key={indice}
                      cx={px(indice)}
                      cy={py(valor)}
                      r={4}
                      className={
                        marcaInvalida && !valida
                          ? `dot dot--hollow stroke-${serie.slot}`
                          : `dot fill-${serie.slot}`
                      }
                    />
                  );
                })}
              </g>
            ))}
            {foco !== null && (
              <line x1={px(foco)} x2={px(foco)} y1={0} y2={ALTURA} className="crosshair" />
            )}
          </svg>
        )}
      </div>
      {marcaInvalida && (
        <div className="trend__legend">
          <span>
            <svg width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="4" className="fill-1" />
            </svg>
            válida
          </span>
          <span>
            <svg width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="3.5" className="dot--hollow stroke-1" />
            </svg>
            inválida
          </span>
        </div>
      )}
    </div>
  );
}

/** Liga os pontos de voltas seguidas; volta sem valor quebra a linha. */
function caminho(
  valores: readonly (number | null)[],
  px: (indice: number) => number,
  py: (valor: number) => number,
): string {
  let d = '';
  let ligado = false;
  valores.forEach((valor, indice) => {
    if (valor === null) {
      ligado = false;
      return;
    }
    d += `${ligado ? 'L' : 'M'}${px(indice).toFixed(1)},${py(valor).toFixed(1)}`;
    ligado = true;
  });
  return d;
}
