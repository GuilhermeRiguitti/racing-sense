import { useMemo, useState } from 'react';
import type { CarLimitsDto, ChannelDto, LiveCatalogDto, LiveValueDto } from '../../shared/dto.js';
import { channelsOf, livePanels } from './channels.js';
import { TraceChart } from './TraceChart.js';
import { useLiveLap } from './useLiveLap.js';
import { useLiveTelemetry } from './useLiveTelemetry.js';

type Aba = 'lap' | 'channels';

const ABAS: readonly { readonly id: Aba; readonly title: string }[] = [
  { id: 'lap', title: 'Volta' },
  { id: 'channels', title: 'Canais' },
];

/**
 * O que o sim está entregando agora: a volta em curso se desenhando e, noutra
 * aba, cada canal com o valor do momento.
 *
 * Cada aba só lê o sim enquanto está aberta. Nada do que aparece aqui é gravado
 * (ADR 0023): a análise sai do `.ibt` quando o piloto sai do carro.
 */
export function LiveView() {
  const [aba, setAba] = useState<Aba>('lap');
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Ao vivo">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === aba}
            className={`tabs__tab${a.id === aba ? ' is-selected' : ''}`}
            onClick={() => setAba(a.id)}
          >
            {a.title}
          </button>
        ))}
      </div>
      {aba === 'lap' ? <LiveLap /> : <LiveChannels />}
    </>
  );
}

/** Os limites do carro só desenham réguas; os canais pedidos não dependem deles. */
const SEM_LIMITES: CarLimitsDto = { redlineRpm: null, shiftRpm: null, fuelCapacityLiters: null };
const LIVE_CHANNELS = channelsOf(livePanels(SEM_LIMITES));

/**
 * A volta em curso ao longo da pista, no mesmo gráfico da volta gravada, com a
 * volta anterior em cinza por baixo da velocidade. É o passo 2 da fase 2 do
 * roadmap: ver a volta se desenhar enquanto ela acontece.
 */
function LiveLap() {
  const live = useLiveLap(LIVE_CHANNELS);
  const [cursor, setCursor] = useState<number | null>(null);
  const catalog = live.state === 'connected' ? live.catalog : null;
  const panels = useMemo(() => (catalog === null ? [] : livePanels(catalog.carLimits)), [catalog]);

  if (live.state !== 'connected') return <LiveStateMessage state={live} />;

  const detalhe =
    live.lap === null
      ? 'Esperando o carro entrar na pista'
      : `Volta ${live.lap}${live.previous === null ? '' : ' · a anterior em cinza, por baixo'}`;

  return (
    <>
      <LiveHeader catalog={live.catalog} detail={detalhe} />
      {live.current.length === 0 ? (
        <p className="muted">Assim que o carro andar, a volta começa a se desenhar aqui.</p>
      ) : (
        <TraceChart
          panels={panels}
          lap={live.current}
          reference={live.previous}
          delta={null}
          offTrack={null}
          sectorStartPcts={live.catalog.sectorStartPcts}
          sectors={null}
          trackLengthMeters={live.catalog.trackLengthMeters}
          stale={false}
          cursor={cursor}
          onCursor={setCursor}
        />
      )}
      <p className="muted live__note">
        Ao vivo é só visualização: nada disto é gravado. Delta, setores e a análise do engenheiro
        saem do arquivo que o sim grava, quando você sai do carro.
      </p>
    </>
  );
}

function LiveHeader({ catalog, detail }: { catalog: LiveCatalogDto; detail: string }) {
  return (
    <header className="session-header">
      <h1 className="session-header__track">{catalog.trackName}</h1>
      <p className="session-header__meta">
        {[catalog.carName, catalog.driverName, catalog.sessionType]
          .filter((parte) => parte !== null && parte !== '')
          .join(' · ')}
      </p>
      <p className="muted">{detail}</p>
    </header>
  );
}

type NotConnected =
  | { readonly state: 'loading' | 'sim-closed' | 'disconnected' }
  | { readonly state: 'failed'; readonly message: string };

function LiveStateMessage({ state }: { state: NotConnected }) {
  switch (state.state) {
    case 'loading':
      return <p className="muted">Procurando o sim…</p>;
    case 'failed':
      return (
        <p role="alert" className="alert">
          Não foi possível ler o sim: {state.message}
        </p>
      );
    case 'sim-closed':
      return (
        <div className="empty">
          <h1>O sim não está aberto</h1>
          <p>
            Entre numa sessão no iRacing — ao volante ou assistindo o carro da equipe — e esta tela
            liga sozinha.
          </p>
        </div>
      );
    case 'disconnected':
      return (
        <div className="empty">
          <h1>O sim está aberto, fora de uma sessão</h1>
          <p>Quando a sessão carregar, os dados aparecem aqui.</p>
        </div>
      );
  }
}

/**
 * O que o sim está entregando agora, canal por canal.
 *
 * É de propósito uma tabela: é preciso saber quais canais o iRacing atualiza ao
 * vivo — e isso muda entre estar ao volante e estar olhando o carro da equipe de
 * fora. A coluna "Ao vivo" é essa medida.
 */
function LiveChannels() {
  const live = useLiveTelemetry();
  const [filtro, setFiltro] = useState('');
  const [soMudando, setSoMudando] = useState(false);

  const linhas = useMemo(() => {
    if (live.state !== 'connected') return [];
    const termo = filtro.trim().toLowerCase();
    return live.catalog.channels
      .map((channel, index) => ({ channel, index }))
      .filter(({ index }) => !soMudando || live.changed.has(index))
      .filter(
        ({ channel }) =>
          termo === '' ||
          channel.name.toLowerCase().includes(termo) ||
          channel.description.toLowerCase().includes(termo),
      );
  }, [live, filtro, soMudando]);

  if (live.state !== 'connected') return <LiveStateMessage state={live} />;

  const { catalog, values, changed, tickCount } = live;
  return (
    <>
      <LiveHeader
        catalog={catalog}
        detail={`Ao vivo · tick ${tickCount} · ${catalog.tickRate} Hz · ${changed.size} de ${catalog.channels.length} canais mudaram desde que a tela abriu`}
      />

      <div className="live__filters">
        <input
          type="search"
          className="live__search"
          placeholder="Filtrar canal"
          aria-label="Filtrar canal"
          value={filtro}
          onChange={(event) => setFiltro(event.target.value)}
        />
        <label className="live__toggle">
          <input
            type="checkbox"
            checked={soMudando}
            onChange={(event) => setSoMudando(event.target.checked)}
          />
          Só os que estão mudando
        </label>
      </div>

      <p className="muted live__note">
        Canal parado pode ser só o carro parado — ou dado que o iRacing não libera ao vivo para
        quem está nesta posição (ao volante, espectador, engenheiro). O app não tenta obter por
        outro caminho o que o sim não entrega.
      </p>

      {/*
       * Larguras fixas: o valor muda a cada frame, e com a largura calculada
       * pelo conteúdo a tabela inteira dança junto com os dígitos.
       */}
      <table className="laps live__table">
        <colgroup>
          <col className="live__col-name" />
          <col className="live__col-value" />
          <col className="live__col-unit" />
          <col className="live__col-state" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>Canal</th>
            <th className="num">Valor</th>
            <th>Unidade</th>
            <th>Ao vivo</th>
            <th>Descrição</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ channel, index }) => (
            <tr key={channel.name}>
              <td className="live__name" title={channel.name}>
                {channel.name}
              </td>
              <td className="num">{formatar(channel, values[index], catalog.playerCarIdx)}</td>
              <td className="muted" title={channel.unit}>
                {channel.unit}
              </td>
              <td>{changed.has(index) ? 'mudando' : <span className="muted">parado</span>}</td>
              <td className="muted" title={channel.description}>
                {channel.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/**
 * Valor como o sim entregou, sem conversão de unidade: a unidade está na coluna
 * ao lado. Canal por carro mostra o valor do carro do dono da máquina.
 */
function formatar(
  channel: ChannelDto,
  value: LiveValueDto | undefined,
  playerCarIdx: number | null,
): string {
  if (value === undefined) return '—';
  if (typeof value !== 'number') {
    if (playerCarIdx === null) return `${value.length} valores`;
    const own = value[playerCarIdx];
    return own === undefined ? '—' : `${formatar(channel, own, null)} (carro ${playerCarIdx})`;
  }
  switch (channel.type) {
    case 'boolean':
      return value !== 0 ? 'sim' : 'não';
    case 'bitfield':
      return `0x${(value >>> 0).toString(16)}`;
    case 'integer':
      return String(value);
    default:
      return Number.isFinite(value) ? decimal.format(value) : String(value);
  }
}
