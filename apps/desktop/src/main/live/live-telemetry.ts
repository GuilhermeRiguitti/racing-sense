import type { CarLimits } from '../domain/car-setup.js';
import type { ChannelDescriptor } from '../domain/channel.js';
import type { GridDriver } from '../domain/driver.js';
import type { SectorStarts } from '../domain/sectors.js';
import type { CarRef, TrackRef } from '../domain/session.js';
import { toChannelDescriptor } from '../ibt/channel-mapping.js';
import {
  freezeLatestFrame,
  freshFrames,
  isConnected,
  type LiveFrame,
  type LiveValue,
  readLiveHeader,
  readLiveSessionInfoText,
  readLiveValue,
  readLiveVariables,
} from '../ibt/live.js';
import { type LiveMemoryHandle, openLiveMemory } from '../ibt/live-memory.js';
import { parseSessionInfo, readPath } from '../ibt/session-info.js';
import {
  toCarLimits,
  toCarRef,
  toDriverName,
  toGridDrivers,
  toSectorStarts,
  toSessionType,
  toSessionTypes,
  toTrackRef,
} from '../ibt/session-mapping.js';
import type { VarHeader } from '../ibt/types.js';

/**
 * O que o sim está entregando agora, e sob qual catálogo.
 *
 * O catálogo muda quando o sim reconecta (outro carro, outra sessão) ou quando a
 * session info é reescrita. `catalogId` identifica a versão: a tela só recebe o
 * catálogo de novo quando ele mudou, e os valores de cada frame vêm na ordem dele.
 */
export interface LiveCatalog {
  readonly catalogId: string;
  readonly tickRate: number;
  readonly channels: readonly ChannelDescriptor[];
  readonly track: TrackRef;
  readonly car: CarRef;
  readonly driverName: string | null;
  readonly sessionType: string | null;
  /**
   * O carro do dono da máquina nos canais `CarIdx*` (`DriverCarIdx`). Numa
   * sessão de equipe, é o carro da equipe — inclusive quando quem está ao
   * volante é outro piloto.
   */
  readonly playerCarIdx: number | null;
  /** Onde cada setor começa, como o sim declara. */
  readonly sectorStartPcts: SectorStarts | null;
  /** Rotação de troca, corte e tanque, como o sim declara. */
  readonly carLimits: CarLimits;
  /**
   * Quem está em cada carro (ADR 0025). Só vive na memória do processo
   * principal; não é gravado nem sai da máquina (ADR 0022).
   */
  readonly drivers: readonly GridDriver[];
  /** O tipo de cada sessão do fim de semana, pelo número (`SessionNum`). */
  readonly sessionTypes: ReadonlyMap<number, string>;
}

export type LiveSnapshot =
  /** Não há memória compartilhada: sim fechado, ou fora do Windows. */
  | { readonly state: 'sim-closed' }
  /** O sim está aberto mas não está numa sessão escrevendo amostras. */
  | { readonly state: 'disconnected' }
  | {
      readonly state: 'connected';
      /** Presente só quando difere do `knownCatalogId` pedido. */
      readonly catalog: LiveCatalog | null;
      readonly catalogId: string;
      readonly tickCount: number;
      /** Um valor por canal, na ordem de `catalog.channels`. */
      readonly values: readonly LiveValue[];
    };

export interface LiveTicksRequest {
  readonly knownCatalogId: string | null;
  /** O último tick que quem pergunta já tem. `null` na primeira pergunta. */
  readonly sinceTick: number | null;
  /** Os canais escalares que interessam, por nome. */
  readonly channels: readonly string[];
}

export interface LiveTick {
  readonly tickCount: number;
  /** O valor de cada canal pedido, na ordem do pedido. */
  readonly values: readonly (number | null)[];
}

export type LiveTicks =
  | { readonly state: 'sim-closed' }
  | { readonly state: 'disconnected' }
  | {
      readonly state: 'connected';
      /** Presente só quando difere do `knownCatalogId` pedido. */
      readonly catalog: LiveCatalog | null;
      readonly catalogId: string;
      /**
       * Cada tick novo, do mais antigo ao mais novo. Canal que o carro não tem,
       * ou que é por carro, vem `null`.
       */
      readonly ticks: readonly LiveTick[];
    };

export interface LiveTelemetry {
  /**
   * Lê o frame mais recente. Quem chama decide o ritmo — a tela pergunta quando
   * vai desenhar; nada roda em segundo plano quando ninguém está olhando.
   */
  snapshot(knownCatalogId?: string | null): LiveSnapshot;
  /**
   * Todos os ticks desde `sinceTick` que o sim ainda guarda (ADR 0025): é o que
   * deixa desenhar o pedal de cada tick, e não um a cada tantos.
   */
  ticks(request: LiveTicksRequest): LiveTicks;
  close(): void;
}

interface Connection {
  readonly memory: LiveMemoryHandle;
  /** Distingue duas conexões seguidas com o mesmo `sessionInfoUpdate`. */
  readonly serial: number;
  variables: readonly VarHeader[];
  catalog: LiveCatalog | null;
  lastFrame: LiveFrame | null;
}

interface Ready {
  readonly connection: Connection;
  readonly catalog: LiveCatalog;
}

type NotReady = { readonly state: 'sim-closed' } | { readonly state: 'disconnected' };

/**
 * A leitura ao vivo do sim, só de leitura (ADR 0022 e 0023).
 *
 * `open` é o ponto de troca do teste: o padrão abre a memória compartilhada do
 * Windows.
 */
export function createLiveTelemetry(
  open: () => LiveMemoryHandle | null = openLiveMemory,
): LiveTelemetry {
  let connection: Connection | null = null;
  let serial = 0;

  const disconnect = () => {
    connection?.memory.close();
    connection = null;
  };

  /** Abre a memória se preciso, confere a sessão e mantém o catálogo em dia. */
  const ready = (): Ready | NotReady => {
    if (connection === null) {
      const memory = open();
      if (memory === null) return { state: 'sim-closed' };
      serial += 1;
      connection = { memory, serial, variables: [], catalog: null, lastFrame: null };
    }

    const header = readLiveHeader(connection.memory);
    if (!isConnected(header)) {
      // Fechar e reabrir no próximo pedido é o que o SDK oficial faz: segurar
      // o handle manteria viva uma região que o sim já abandonou.
      disconnect();
      return { state: 'disconnected' };
    }

    const catalogId = `${connection.serial}:${header.sessionInfoUpdate}`;
    if (connection.catalog?.catalogId !== catalogId) {
      connection.variables = readLiveVariables(connection.memory, header);
      connection.catalog = buildCatalog(
        catalogId,
        header.tickRate,
        connection.variables,
        readLiveSessionInfoText(connection.memory, header),
      );
    }
    return { connection, catalog: connection.catalog };
  };

  return {
    snapshot(knownCatalogId = null) {
      const opened = ready();
      if (!('connection' in opened)) return opened;
      const { connection: current, catalog } = opened;

      // Frame que o sim reescreveu no meio da cópia é descartado; vale o último
      // inteiro. Só na primeira leitura não existe um.
      const frame = freezeLatestFrame(current.memory) ?? current.lastFrame;
      if (frame === null) return { state: 'disconnected' };
      current.lastFrame = frame;

      return {
        state: 'connected',
        catalog: knownCatalogId === catalog.catalogId ? null : catalog,
        catalogId: catalog.catalogId,
        tickCount: frame.tickCount,
        values: current.variables.map((variable) => readLiveValue(frame, variable)),
      };
    },

    ticks({ knownCatalogId, sinceTick, channels }) {
      const opened = ready();
      if (!('connection' in opened)) return opened;
      const { connection: current, catalog } = opened;

      const byName = new Map(current.variables.map((variable) => [variable.name, variable]));
      const wanted = channels.map((name) => {
        const variable = byName.get(name);
        return variable !== undefined && variable.count === 1 ? variable : null;
      });
      // Catálogo novo é outra conexão ou outra sessão: o tick de antes não vale
      // como marco, e a contagem do sim pode ter recomeçado.
      const known = knownCatalogId === catalog.catalogId;

      return {
        state: 'connected',
        catalog: known ? null : catalog,
        catalogId: catalog.catalogId,
        ticks: freshFrames(current.memory, known ? sinceTick : null).map((frame) => ({
          tickCount: frame.tickCount,
          values: wanted.map((variable) =>
            variable === null ? null : (readLiveValue(frame, variable) as number),
          ),
        })),
      };
    },

    close: disconnect,
  };
}

function buildCatalog(
  catalogId: string,
  tickRate: number,
  variables: readonly VarHeader[],
  sessionInfoText: string,
): LiveCatalog {
  const info = parseSessionInfo(sessionInfoText);
  const carIdx = readPath(info.DriverInfo, 'DriverCarIdx');
  return {
    catalogId,
    tickRate,
    channels: variables.map(toChannelDescriptor),
    track: toTrackRef(info),
    car: toCarRef(info),
    driverName: toDriverName(info),
    sessionType: toSessionType(info),
    playerCarIdx: carIdx !== undefined && /^\d+$/.test(carIdx) ? Number(carIdx) : null,
    sectorStartPcts: toSectorStarts(info),
    carLimits: toCarLimits(info),
    drivers: toGridDrivers(info),
    sessionTypes: toSessionTypes(info),
  };
}
