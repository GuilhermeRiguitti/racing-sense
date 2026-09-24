import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { downsample } from '../../main/domain/distance-series.js';
import type { LapStretchDto, SectorComparisonDto, SeriesDto } from '../../shared/dto.js';
import { type ChannelView, type PanelView, seriesFor } from './channels.js';
import {
  formatDelta,
  formatDistance,
  formatSectorTime,
  niceCeil,
  niceTicks,
  seriesPath,
  valueAtCursor,
} from './chart-math.js';

const MARGEM_ESQUERDA = 52;
const MARGEM_DIREITA = 16;
const ALTURA_EIXO_X = 28;
const ALTURA_DELTA = 120;
const ALTURA_FAIXA_SETORES = 22;
/** Abaixo desta largura, o setor mostra só o nome; o número fica na dica. */
const LARGURA_MINIMA_ROTULO_SETOR = 72;

interface Props {
  readonly panels: readonly PanelView[];
  /** Séries da volta escolhida. */
  readonly lap: readonly SeriesDto[];
  /** Séries da referência, quando há uma e a volta é comparável. */
  readonly reference: readonly SeriesDto[] | null;
  /** Delta acumulado contra a referência, quando há. */
  readonly delta: SeriesDto | null;
  /** Onde a volta saiu da pista. `null` quando não se sabe. */
  readonly offTrack: readonly LapStretchDto[] | null;
  /** Onde cada setor da pista começa. `null` quando a sessão não tem setores. */
  readonly sectorStartPcts: readonly number[] | null;
  /** Ganho ou perda por setor contra a referência, quando há. */
  readonly sectors: readonly SectorComparisonDto[] | null;
  /** Com o comprimento, o eixo fala em metros; sem ele, em fração da volta. */
  readonly trackLengthMeters: number | null;
  /** Esmaece enquanto a próxima volta carrega, sem apagar a atual. */
  readonly stale: boolean;
  /** Posição do cursor em `lapDistPct`, compartilhada com o resto da tela. */
  readonly cursor: number | null;
  readonly onCursor: (cursor: number | null) => void;
}

/** Uma linha pronta para desenhar, e a série inteira para a leitura do cursor. */
interface Linha {
  readonly view: ChannelView;
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
 * Quando há referência, o delta abre a pilha: é a primeira pergunta do piloto
 * ("onde perdi?"), e os painéis abaixo respondem a segunda ("por quê?").
 *
 * O desenho usa a série reduzida à largura da tela (min/max por coluna de
 * pixel, então o pico de freio sobrevive). A leitura do cursor usa a série
 * inteira: o número que aparece é o que o arquivo gravou.
 */
export function TraceChart({
  panels,
  lap,
  reference,
  delta,
  offTrack,
  sectorStartPcts,
  sectors,
  trackLengthMeters,
  stale,
  cursor,
  onCursor,
}: Props) {
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

  const larguraPlot = Math.max(0, largura - MARGEM_ESQUERDA - MARGEM_DIREITA);
  const px = (fracao: number) => MARGEM_ESQUERDA + fracao * larguraPlot;

  const paineis = useMemo(
    () =>
      panels
        .map((painel) => montarPainel(painel, lap, reference, larguraPlot))
        // Painel sem nenhuma linha é canal que este carro não tem: some.
        .filter((painel) => painel.linhas.some((linha) => linha.view.source === 'lap')),
    [panels, lap, reference, larguraPlot],
  );

  const deltaReduzido = useMemo(
    () =>
      delta === null || delta.x.length === 0 || larguraPlot <= 0
        ? null
        : downsample(delta, Math.max(2, Math.floor(larguraPlot * 2))),
    [delta, larguraPlot],
  );

  const moverPara = (evento: PointerEvent<HTMLDivElement>) => {
    const retangulo = evento.currentTarget.getBoundingClientRect();
    const fracao = (evento.clientX - retangulo.left - MARGEM_ESQUERDA) / larguraPlot;
    onCursor(fracao < 0 || fracao > 1 ? null : fracao);
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
      onCursor(proximo[evento.key] ?? null);
    }
  };

  const distancia = (fracao: number) => formatDistance(fracao, trackLengthMeters);
  const trechos = offTrack ?? [];
  const divisas = sectorStartPcts?.slice(1) ?? [];

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
        {trechos.length > 0 && (
          <span className="trace__legend-off">
            <svg width="12" height="12" aria-hidden="true">
              <rect width="12" height="12" rx="2" className="off-track" />
            </svg>
            fora da pista ({trechos.length === 1 ? '1 trecho' : `${trechos.length} trechos`})
          </span>
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
        onPointerLeave={() => onCursor(null)}
        onKeyDown={teclado}
      >
        {largura > 0 && delta !== null && (
          <PainelDelta
            completo={delta}
            reduzido={deltaReduzido}
            largura={largura}
            px={px}
            cursor={cursor}
            trechos={trechos}
            divisas={divisas}
            setores={sectors}
          />
        )}
        {largura > 0 &&
          paineis.map((painel) => (
            <Painel
              key={painel.view.id}
              painel={painel}
              largura={largura}
              px={px}
              cursor={cursor}
              trechos={trechos}
              divisas={divisas}
            />
          ))}
        {largura > 0 && paineis.length === 0 && (
          <p className="trace__empty">
            Esta volta não tem nenhum destes canais gravado. Sessões importadas antes desta versão
            do aplicativo só guardaram os canais de pilotagem.
          </p>
        )}
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

function inteirosEntre(baixo: number, alto: number): number[] {
  const valores: number[] = [];
  for (let v = Math.ceil(baixo); v <= Math.floor(alto); v += 1) valores.push(v);
  return valores;
}

function montarPainel(
  view: PanelView,
  lap: readonly SeriesDto[],
  reference: readonly SeriesDto[] | null,
  larguraPlot: number,
): PainelMontado {
  const linhas: Linha[] = [];
  for (const canal of view.channels) {
    const fonte = canal.source === 'lap' ? lap : reference;
    if (fonte === null) continue;
    const serie = seriesFor(fonte, canal.channel);
    if (serie === undefined || serie.x.length === 0) continue;
    // Duas amostras por coluna de pixel: o mínimo e o máximo daquela coluna.
    // O alvo sai da largura medida da tela, não de um número escolhido.
    const reduzida =
      larguraPlot > 0 ? downsample(serie, Math.max(2, Math.floor(larguraPlot * 2))) : serie;
    linhas.push({
      view: canal,
      completa: serie,
      desenho: { x: reduzida.x, y: reduzida.y.map(canal.toDisplay) },
      degrau: serie.type !== 'number',
    });
  }

  const todos = linhas.flatMap((linha) => linha.desenho.y);
  // A régua entra na faixa: a troca de marcha a 7250 rpm não pode ficar fora
  // do painel só porque a volta não chegou lá.
  for (const regra of view.rules ?? []) todos.push(regra.value);
  let minimo = Number.POSITIVE_INFINITY;
  let maximo = Number.NEGATIVE_INFINITY;
  for (const valor of todos) {
    if (valor < minimo) minimo = valor;
    if (valor > maximo) maximo = valor;
  }
  if (todos.length === 0) {
    minimo = 0;
    maximo = 1;
  }

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

/** Faixas de fora da pista atrás do gráfico: o "onde" da marcação da volta. */
function FaixasForaDaPista({
  trechos,
  px,
  altura,
}: {
  trechos: readonly LapStretchDto[];
  px: (fracao: number) => number;
  altura: number;
}) {
  return (
    <>
      {trechos.map((trecho) => {
        const x = px(trecho.startPct);
        // Um trecho de uma amostra ainda aparece: um pixel, não zero.
        const largura = Math.max(1, px(trecho.endPct) - x);
        return (
          <rect
            key={`${trecho.startPct}-${trecho.endPct}`}
            x={x}
            y={0}
            width={largura}
            height={altura}
            className="off-track"
          />
        );
      })}
    </>
  );
}

/**
 * Onde um setor termina e o outro começa. Recessivas como a grade: situam o
 * piloto na pista sem competir com a linha que ele está lendo.
 */
function DivisasDeSetor({
  divisas,
  px,
  altura,
}: {
  divisas: readonly number[];
  px: (fracao: number) => number;
  altura: number;
}) {
  return (
    <>
      {divisas.map((divisa) => (
        <line
          key={divisa}
          x1={px(divisa)}
          x2={px(divisa)}
          y1={0}
          y2={altura}
          className="sector-divider"
        />
      ))}
    </>
  );
}

function Painel({
  painel,
  largura,
  px,
  cursor,
  trechos,
  divisas,
}: {
  painel: PainelMontado;
  largura: number;
  px: (fracao: number) => number;
  cursor: number | null;
  trechos: readonly LapStretchDto[];
  divisas: readonly number[];
}) {
  const { view, linhas, dominio } = painel;
  const [baixo, alto] = dominio;
  const topo = 6;
  const base = view.height - 4;
  const py = (valor: number) => base - ((valor - baixo) / (alto - baixo || 1)) * (base - topo);
  const ticks = painel.discreto
    ? inteirosEntre(baixo, alto)
    : niceTicks(baixo, alto, view.height > 100 ? 4 : 2);
  const idClip = `clip-${view.id.replace(/\W/g, '')}`;
  // Referência por baixo, volta por cima: a linha que o piloto está olhando
  // nunca fica escondida atrás da régua.
  const ordenadas = [...linhas].sort(
    (a, b) => Number(a.view.source === 'lap') - Number(b.view.source === 'lap'),
  );

  return (
    <div className="panel">
      <div className="panel__header">
        <span className="panel__title">
          {view.title}
          {/* A régua é explicada no cabeçalho, não sobre o traço: rótulo em cima
              da linha colide quando duas réguas ficam perto. */}
          {(view.rules ?? []).length > 0 && (
            <span className="panel__rules">
              {(view.rules ?? [])
                .map((regra) => `${regra.label} ${regra.value.toLocaleString('pt-BR')}`)
                .join(' · ')}
            </span>
          )}
        </span>
        {/* Legenda sempre que houver duas séries; a cor nunca carrega a identidade sozinha. */}
        <span className="panel__values">
          {linhas.map((linha) => {
            const bruto = valueAtCursor(linha.completa, cursor);
            return (
              <span key={`${linha.view.source}-${linha.view.channel}`} className="panel__value">
                {linhas.length > 1 && (
                  <svg className="panel__key" width="14" height="8" aria-hidden="true">
                    <line x1="1" y1="4" x2="13" y2="4" className={`stroke-${linha.view.slot}`} />
                  </svg>
                )}
                {linhas.length > 1 && <span className="panel__label">{linha.view.label}</span>}
                <strong>
                  {bruto === undefined ? '—' : linha.view.format(linha.view.toDisplay(bruto))}
                </strong>
                {linha.view.unit !== '' && <span className="panel__unit">{linha.view.unit}</span>}
              </span>
            );
          })}
        </span>
      </div>
      <svg width={largura} height={view.height} className="panel__plot" aria-hidden="true">
        <defs>
          <clipPath id={idClip}>
            <rect x={px(0)} y={0} width={px(1) - px(0)} height={view.height} />
          </clipPath>
        </defs>
        <FaixasForaDaPista trechos={trechos} px={px} altura={view.height} />
        <DivisasDeSetor divisas={divisas} px={px} altura={view.height} />
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
        {(view.rules ?? []).map((regra) => (
          <line
            key={regra.label}
            x1={px(0)}
            x2={px(1)}
            y1={py(regra.value)}
            y2={py(regra.value)}
            className="rule"
          />
        ))}
        <g clipPath={`url(#${idClip})`}>
          {ordenadas.map((linha) => (
            <path
              key={`${linha.view.source}-${linha.view.channel}`}
              d={seriesPath(linha.desenho.x, linha.desenho.y, px, py, linha.degrau)}
              className={`series stroke-${linha.view.slot}`}
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

/**
 * O delta acumulado contra a referência.
 *
 * Positivo é tempo perdido, e fica para cima — a convenção das ferramentas de
 * engenharia de pista (a curva "sobe" onde o piloto ficou para trás). A
 * polaridade é codificada duas vezes: pela posição em relação ao zero e pela
 * cor (divergente azul/vermelho, com o zero neutro). A leitura do cursor diz em
 * texto "perdendo" ou "ganhando", então a cor nunca carrega o sentido sozinha.
 *
 * O que importa é a **inclinação**: onde a curva sobe, a volta está perdendo
 * tempo naquele trecho, mesmo que o acumulado ainda seja negativo. Por isso,
 * quando a sessão tem setores, a faixa acima do gráfico já diz a inclinação de
 * cada setor em número: quanto se ganhou ou perdeu só ali.
 */
function PainelDelta({
  completo,
  reduzido,
  largura,
  px,
  cursor,
  trechos,
  divisas,
  setores,
}: {
  completo: SeriesDto;
  reduzido: SeriesDto | null;
  largura: number;
  px: (fracao: number) => number;
  cursor: number | null;
  trechos: readonly LapStretchDto[];
  divisas: readonly number[];
  setores: readonly SectorComparisonDto[] | null;
}) {
  const altura = ALTURA_DELTA;
  const pontos = reduzido ?? completo;
  let maiorModulo = 0;
  for (const valor of pontos.y) maiorModulo = Math.max(maiorModulo, Math.abs(valor));
  const limite = niceCeil(maiorModulo) || 0.1;
  const topo = 6;
  const base = altura - 4;
  const py = (valor: number) => base - ((valor + limite) / (2 * limite)) * (base - topo);
  const zero = py(0);
  const ticks = niceTicks(-limite, limite, 4);

  const linha = seriesPath(pontos.x, pontos.y, px, py, false);
  const primeiroX = px(pontos.x[0] ?? 0);
  const ultimoX = px(pontos.x[pontos.x.length - 1] ?? 0);
  // A área entre a curva e o zero; o recorte decide de que lado ela é pintada.
  const area =
    pontos.x.length > 0 ? `${linha}L${ultimoX.toFixed(1)},${zero}L${primeiroX.toFixed(1)},${zero}Z` : '';

  const agora = valueAtCursor(completo, cursor);
  const setorNoCursor =
    cursor === null || setores === null
      ? undefined
      : setores.find((setor) => cursor >= setor.startPct && cursor < setor.endPct);

  return (
    <div className="panel panel--delta">
      <div className="panel__header">
        <span className="panel__title">Delta para a referência</span>
        <span className="panel__values">
          {setorNoCursor !== undefined && (
            <span className="panel__value">
              <span className="panel__label">S{setorNoCursor.index + 1}</span>
              <strong>
                {setorNoCursor.deltaSeconds === null ? '—' : formatDelta(setorNoCursor.deltaSeconds)}
              </strong>
              <span className="panel__unit">s no setor</span>
            </span>
          )}
          <span className="panel__value">
            <strong>{agora === undefined ? '—' : formatDelta(agora)}</strong>
            <span className="panel__unit">s</span>
            {agora !== undefined && agora !== 0 && (
              <span className="panel__label">{agora > 0 ? 'atrás' : 'à frente'}</span>
            )}
          </span>
        </span>
      </div>
      {setores !== null && setores.length > 1 && (
        <FaixaDeSetores setores={setores} largura={largura} px={px} />
      )}
      <svg width={largura} height={altura} className="panel__plot" aria-hidden="true">
        <defs>
          <clipPath id="delta-perda">
            <rect x={px(0)} y={0} width={px(1) - px(0)} height={Math.max(0, zero)} />
          </clipPath>
          <clipPath id="delta-ganho">
            <rect x={px(0)} y={zero} width={px(1) - px(0)} height={Math.max(0, altura - zero)} />
          </clipPath>
        </defs>
        <FaixasForaDaPista trechos={trechos} px={px} altura={altura} />
        <DivisasDeSetor divisas={divisas} px={px} altura={altura} />
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={px(0)}
              x2={px(1)}
              y1={py(tick)}
              y2={py(tick)}
              className={tick === 0 ? 'baseline' : 'grid'}
            />
            <text x={px(0) - 8} y={py(tick)} className="tick tick--y">
              {tick === 0 ? '0' : formatDelta(tick)}
            </text>
          </g>
        ))}
        <path d={area} className="delta-area delta-area--loss" clipPath="url(#delta-perda)" />
        <path d={area} className="delta-area delta-area--gain" clipPath="url(#delta-ganho)" />
        <path d={linha} className="series delta-line" />
        {cursor !== null && (
          <line x1={px(cursor)} x2={px(cursor)} y1={0} y2={altura} className="crosshair" />
        )}
      </svg>
    </div>
  );
}

/**
 * Quanto a volta ganhou ou perdeu em cada setor, sobre o trecho do setor.
 *
 * O número fica na cor do texto; quem carrega a polaridade é o sinal e o
 * marcador ao lado (azul ganhou, vermelho perdeu — o mesmo par do delta). Setor
 * estreito demais para o número mostra só o nome, e o número vai na dica.
 */
function FaixaDeSetores({
  setores,
  largura,
  px,
}: {
  setores: readonly SectorComparisonDto[];
  largura: number;
  px: (fracao: number) => number;
}) {
  const meio = ALTURA_FAIXA_SETORES / 2;
  return (
    <svg width={largura} height={ALTURA_FAIXA_SETORES} className="sector-strip" aria-hidden="true">
      {setores.map((setor) => {
        const inicio = px(setor.startPct);
        const fim = px(setor.endPct);
        const centro = (inicio + fim) / 2;
        const nome = `S${setor.index + 1}`;
        const delta = setor.deltaSeconds;
        const cabeNumero = fim - inicio >= LARGURA_MINIMA_ROTULO_SETOR;
        const sentido =
          delta === null || delta === 0 ? null : delta > 0 ? 'loss' : 'gain';
        const dica =
          delta === null
            ? `Setor ${setor.index + 1}: sem tempo em uma das voltas`
            : `Setor ${setor.index + 1}: ${formatSectorTime(setor.lapSeconds)} s contra ` +
              `${formatSectorTime(setor.referenceSeconds)} s da referência — ` +
              (delta === 0
                ? 'igual'
                : `${delta > 0 ? 'perdeu' : 'ganhou'} ${formatDelta(Math.abs(delta)).replace('+', '')} s`);
        return (
          <g key={setor.index} className="sector-strip__cell">
            <title>{dica}</title>
            {/* Alvo da dica do tamanho do setor inteiro, não só do texto. */}
            <rect x={inicio} y={0} width={Math.max(0, fim - inicio)} height={ALTURA_FAIXA_SETORES} className="sector-strip__hit" />
            {setor.index > 0 && (
              <line x1={inicio} x2={inicio} y1={0} y2={ALTURA_FAIXA_SETORES} className="sector-divider" />
            )}
            <text x={centro} y={meio} className="sector-strip__label">
              {sentido !== null && cabeNumero && (
                <tspan className={`sector-strip__mark sector-strip__mark--${sentido}`} dx={0}>
                  {'■ '}
                </tspan>
              )}
              <tspan className="sector-strip__name">{nome}</tspan>
              {cabeNumero && (
                <tspan className="sector-strip__delta" dx={6}>
                  {delta === null ? '—' : formatDelta(delta)}
                </tspan>
              )}
            </text>
          </g>
        );
      })}
    </svg>
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
