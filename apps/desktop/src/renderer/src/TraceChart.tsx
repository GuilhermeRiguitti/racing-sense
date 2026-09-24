import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { downsample } from '../../main/domain/distance-series.js';
import type { SeriesDto } from '../../shared/dto.js';
import { type ChannelView, PANELS, type PanelView, seriesFor } from './channels.js';
import { nearestIndex, niceCeil, niceTicks, seriesPath } from './chart-math.js';

const MARGEM_ESQUERDA = 52;
const MARGEM_DIREITA = 16;
const ALTURA_EIXO_X = 28;

interface Props {
  readonly series: readonly SeriesDto[];
  /** Com o comprimento, o eixo fala em metros; sem ele, em fração da volta. */
  readonly trackLengthMeters: number | null;
  /** Esmaece enquanto a próxima volta carrega, sem apagar a atual. */
  readonly stale: boolean;
}

/** Uma linha pronta para desenhar, e a série inteira para a leitura do cursor. */
interface Linha {
  readonly view: ChannelView;
  readonly slot: 1 | 2;
  readonly completa: SeriesDto;
  readonly desenho: { readonly x: readonly number[]; readonly y: readonly number[] };
  readonly degrau: boolean;
}

/**
 * A volta ao longo da distância: um painel por grandeza, todos no mesmo eixo X.
 *
 * Um painel, um eixo Y — acelerador e freio dividem painel porque dividem a
 * unidade (%); velocidade e RPM não, porque dois eixos no mesmo gráfico inventam
 * correlação que não existe. O cursor atravessa todos os painéis de uma vez, e
 * a leitura mostra todo canal naquele ponto da pista.
 *
 * O desenho usa a série reduzida à largura da tela (min/max por coluna de
 * pixel, então o pico de freio sobrevive). A leitura do cursor usa a série
 * inteira: o número que aparece é o que o arquivo gravou.
 */
export function TraceChart({ series, trackLengthMeters, stale }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);

  useEffect(() => {
    const elemento = caixa.current;
    if (elemento === null) return;
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada !== undefined) setLargura(entrada.contentRect.width);
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const larguraPlot = Math.max(0, largura - MARGEM_ESQUERDA - MARGEM_DIREITA);
  const px = (fracao: number) => MARGEM_ESQUERDA + fracao * larguraPlot;

  const paineis = useMemo(
    () => PANELS.map((painel) => montarPainel(painel, series, larguraPlot)),
    [series, larguraPlot],
  );

  const moverPara = (evento: PointerEvent<HTMLDivElement>) => {
    const retangulo = evento.currentTarget.getBoundingClientRect();
    const fracao = (evento.clientX - retangulo.left - MARGEM_ESQUERDA) / larguraPlot;
    setCursor(fracao < 0 || fracao > 1 ? null : fracao);
  };

  const teclado = (evento: KeyboardEvent<HTMLDivElement>) => {
    // Passo de navegação, não de análise: meio por cento da volta, ou 5% com shift.
    const passo = evento.shiftKey ? 0.05 : 0.005;
    const atual = cursor ?? 0;
    const proximo: Record<string, number | null> = {
      ArrowRight: Math.min(1, atual + passo),
      ArrowLeft: Math.max(0, atual - passo),
      Home: 0,
      End: 1,
      Escape: null,
    };
    if (evento.key in proximo) {
      evento.preventDefault();
      setCursor(proximo[evento.key] ?? null);
    }
  };

  const distancia = (fracao: number) =>
    trackLengthMeters === null
      ? `${(fracao * 100).toFixed(1).replace('.', ',')}%`
      : `${Math.round(fracao * trackLengthMeters).toLocaleString('pt-BR')} m`;

  return (
    <section
      className={`trace${stale ? ' trace--stale' : ''}`}
      aria-label="Canais ao longo da volta"
    >
      <div className="trace__readout" aria-live="polite">
        <span className="trace__readout-label">Distância</span>
        <span className="trace__readout-value">{cursor === null ? '—' : distancia(cursor)}</span>
        {cursor === null && (
          <span className="trace__hint">Passe o mouse sobre o gráfico, ou use as setas</span>
        )}
      </div>
      <div
        ref={caixa}
        className="trace__stack"
        tabIndex={0}
        // O cursor é um controle deslizante sobre a distância da volta: o
        // leitor de tela anuncia onde ele está, e as setas o movem.
        role="slider"
        aria-label="Posição na volta. Setas movem; shift anda mais rápido; Esc limpa."
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={cursor === null ? 0 : Math.round(cursor * 100)}
        aria-valuetext={cursor === null ? 'fora do gráfico' : distancia(cursor)}
        onPointerMove={moverPara}
        onPointerLeave={() => setCursor(null)}
        onKeyDown={teclado}
      >
        {largura > 0 &&
          paineis.map((painel) => (
            <Painel
              key={painel.view.title}
              painel={painel}
              largura={largura}
              px={px}
              cursor={cursor}
            />
          ))}
        {largura > 0 && (
          <EixoX largura={largura} px={px} cursor={cursor} trackLengthMeters={trackLengthMeters} />
        )}
      </div>
    </section>
  );
}

interface PainelMontado {
  readonly view: PanelView;
  readonly linhas: readonly Linha[];
  readonly dominio: readonly [number, number];
  /** Todo canal do painel é discreto: marcação em cada valor inteiro. */
  readonly discreto: boolean;
}

/**
 * O valor gravado mais perto do cursor — **só dentro do trecho que a volta
 * cobriu**. Fora dele, não existe valor: mostrar a última amostra ali faria a
 * tela dizer "100% de freio" num ponto da pista onde o carro nunca esteve.
 * O limite é o próprio intervalo gravado, não uma distância escolhida.
 */
function valorNoCursor(serie: SeriesDto, cursor: number | null): number | undefined {
  if (cursor === null || serie.x.length === 0) return undefined;
  const primeiro = Math.min(serie.x[0] ?? 0, serie.x[serie.x.length - 1] ?? 0);
  const ultimo = Math.max(serie.x[0] ?? 0, serie.x[serie.x.length - 1] ?? 0);
  if (cursor < primeiro || cursor > ultimo) return undefined;
  const indice = nearestIndex(serie.x, cursor);
  return indice >= 0 ? serie.y[indice] : undefined;
}

function inteirosEntre(baixo: number, alto: number): number[] {
  const valores: number[] = [];
  for (let v = Math.ceil(baixo); v <= Math.floor(alto); v += 1) valores.push(v);
  return valores;
}

function montarPainel(
  view: PanelView,
  series: readonly SeriesDto[],
  larguraPlot: number,
): PainelMontado {
  const linhas: Linha[] = [];
  view.channels.forEach((canal, indice) => {
    const serie = seriesFor(series, canal.channel);
    if (serie === undefined || serie.x.length === 0) return;
    // Duas amostras por coluna de pixel: o mínimo e o máximo daquela coluna.
    // O alvo sai da largura medida da tela, não de um número escolhido.
    const reduzida =
      larguraPlot > 0 ? downsample(serie, Math.max(2, Math.floor(larguraPlot * 2))) : serie;
    linhas.push({
      view: canal,
      slot: indice === 0 ? 1 : 2,
      completa: serie,
      desenho: { x: reduzida.x, y: reduzida.y.map(canal.toDisplay) },
      degrau: serie.type !== 'number',
    });
  });

  const todos = linhas.flatMap((linha) => linha.desenho.y);
  const minimo = todos.length > 0 ? Math.min(...todos) : 0;
  const maximo = todos.length > 0 ? Math.max(...todos) : 1;

  const discreto = linhas.length > 0 && linhas.every((linha) => linha.degrau);
  let dominio: readonly [number, number];
  if (discreto) {
    // Meia unidade de folga: a 1ª e a última marcha não colam na borda.
    dominio = [Math.floor(minimo) - 0.5, Math.ceil(maximo) + 0.5];
  } else if (Array.isArray(view.domain)) {
    dominio = view.domain as readonly [number, number];
  } else if (view.domain === 'from-zero') {
    dominio = [0, niceCeil(maximo) || 1];
  } else if (view.domain === 'symmetric') {
    const limite = niceCeil(Math.max(Math.abs(minimo), Math.abs(maximo))) || 1;
    dominio = [-limite, limite];
  } else {
    dominio = minimo === maximo ? [minimo - 1, maximo + 1] : [minimo, maximo];
  }
  return { view, linhas, dominio, discreto };
}

function Painel({
  painel,
  largura,
  px,
  cursor,
}: {
  painel: PainelMontado;
  largura: number;
  px: (fracao: number) => number;
  cursor: number | null;
}) {
  const { view, linhas, dominio } = painel;
  const [baixo, alto] = dominio;
  const topo = 6;
  const base = view.height - 4;
  const py = (valor: number) => base - ((valor - baixo) / (alto - baixo || 1)) * (base - topo);
  const ticks = painel.discreto
    ? inteirosEntre(baixo, alto)
    : niceTicks(baixo, alto, view.height > 100 ? 4 : 2);
  const idClip = `clip-${view.title.replace(/\W/g, '')}`;

  return (
    <div className="panel">
      <div className="panel__header">
        <span className="panel__title">{view.title}</span>
        {/* Legenda sempre que houver duas séries; a cor nunca carrega a identidade sozinha. */}
        <span className="panel__values">
          {linhas.map((linha) => {
            const bruto = valorNoCursor(linha.completa, cursor);
            return (
              <span key={linha.view.channel} className="panel__value">
                {linhas.length > 1 && (
                  <svg className="panel__key" width="14" height="8" aria-hidden="true">
                    <line x1="1" y1="4" x2="13" y2="4" className={`stroke-series-${linha.slot}`} />
                  </svg>
                )}
                <strong>
                  {bruto === undefined ? '—' : linha.view.format(linha.view.toDisplay(bruto))}
                </strong>
                {linha.view.unit !== '' && <span className="panel__unit">{linha.view.unit}</span>}
                {linhas.length > 1 && <span className="panel__label">{linha.view.label}</span>}
              </span>
            );
          })}
          {linhas.length === 0 && <span className="panel__missing">canal não gravado</span>}
        </span>
      </div>
      <svg width={largura} height={view.height} className="panel__plot" aria-hidden="true">
        <defs>
          <clipPath id={idClip}>
            <rect x={px(0)} y={0} width={px(1) - px(0)} height={view.height} />
          </clipPath>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={px(0)} x2={px(1)} y1={py(tick)} y2={py(tick)} className="grid" />
            <text x={px(0) - 8} y={py(tick)} className="tick tick--y">
              {/* Marcação é número redondo: sem casa decimal forçada. Só a marcha
                  usa o formato do canal, para mostrar R e N. */}
              {painel.discreto
                ? (linhas[0]?.view.format(tick) ?? tick)
                : tick.toLocaleString('pt-BR')}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${idClip})`}>
          {linhas.map((linha) => (
            <path
              key={linha.view.channel}
              d={seriesPath(linha.desenho.x, linha.desenho.y, px, py, linha.degrau)}
              className={`series stroke-series-${linha.slot}`}
            />
          ))}
        </g>
        {cursor !== null && (
          <line x1={px(cursor)} x2={px(cursor)} y1={0} y2={view.height} className="crosshair" />
        )}
      </svg>
    </div>
  );
}

function EixoX({
  largura,
  px,
  cursor,
  trackLengthMeters,
}: {
  largura: number;
  px: (fracao: number) => number;
  cursor: number | null;
  trackLengthMeters: number | null;
}) {
  const total = trackLengthMeters ?? 100;
  const larguraPlot = px(1) - px(0);
  // Cabe uma marcação a cada ~90 px sem os rótulos se tocarem.
  const ticks = niceTicks(0, total, Math.max(2, Math.floor(larguraPlot / 90)));
  const rotulo = (valor: number) =>
    trackLengthMeters === null ? `${valor}%` : `${valor.toLocaleString('pt-BR')} m`;

  return (
    <svg width={largura} height={ALTURA_EIXO_X} className="axis-x" aria-hidden="true">
      <line x1={px(0)} x2={px(1)} y1={1} y2={1} className="baseline" />
      {ticks.map((tick) => (
        <text key={tick} x={px(tick / total)} y={18} className="tick tick--x">
          {rotulo(tick)}
        </text>
      ))}
      {cursor !== null && (
        <line x1={px(cursor)} x2={px(cursor)} y1={0} y2={6} className="crosshair" />
      )}
    </svg>
  );
}
