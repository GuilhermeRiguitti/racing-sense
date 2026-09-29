import { useMemo, useState } from 'react';
import type { ChannelDto, LiveValueDto } from '../../shared/dto.js';
import { useLiveTelemetry } from './useLiveTelemetry.js';

/**
 * O que o sim está entregando agora, canal por canal.
 *
 * É a primeira tela ao vivo, e é de propósito uma tabela: antes de desenhar
 * qualquer gráfico em tempo real, é preciso saber quais canais o iRacing
 * atualiza ao vivo — e isso muda entre estar ao volante e estar olhando o carro
 * da equipe de fora. A coluna "Ao vivo" é essa medida.
 */
export function LiveView() {
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

  if (live.state === 'loading') {
    return <p className="muted">Procurando o sim…</p>;
  }
  if (live.state === 'failed') {
    return (
      <p role="alert" className="alert">
        Não foi possível ler o sim: {live.message}
      </p>
    );
  }
  if (live.state === 'sim-closed') {
    return (
      <div className="empty">
        <h1>O sim não está aberto</h1>
        <p>
          Entre numa sessão no iRacing — ao volante ou assistindo o carro da equipe — e esta tela
          liga sozinha.
        </p>
      </div>
    );
  }
  if (live.state === 'disconnected') {
    return (
      <div className="empty">
        <h1>O sim está aberto, fora de uma sessão</h1>
        <p>Quando a sessão carregar, os canais aparecem aqui.</p>
      </div>
    );
  }

  const { catalog, values, changed, tickCount } = live;
  return (
    <>
      <header className="session-header">
        <h1 className="session-header__track">{catalog.trackName}</h1>
        <p className="session-header__meta">
          {[catalog.carName, catalog.driverName, catalog.sessionType]
            .filter((parte) => parte !== null && parte !== '')
            .join(' · ')}
        </p>
        <p className="muted">
          Ao vivo · tick {tickCount} · {catalog.tickRate} Hz · {changed.size} de{' '}
          {catalog.channels.length} canais mudaram desde que a tela abriu
        </p>
      </header>

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
