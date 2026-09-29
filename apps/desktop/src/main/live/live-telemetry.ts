import type { ChannelDescriptor } from '../domain/channel.js';
import type { CarRef, TrackRef } from '../domain/session.js';
import { toChannelDescriptor } from '../ibt/channel-mapping.js';
import {
  freezeLatestFrame,
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
import { toCarRef, toDriverName, toSessionType, toTrackRef } from '../ibt/session-mapping.js';
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

export interface LiveTelemetry {
  /**
   * Lê o frame mais recente. Quem chama decide o ritmo — a tela pergunta quando
   * vai desenhar; nada roda em segundo plano quando ninguém está olhando.
   */
  snapshot(knownCatalogId?: string | null): LiveSnapshot;
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

  return {
    snapshot(knownCatalogId = null) {
      if (connection === null) {
        const memory = open();
        if (memory === null) return { state: 'sim-closed' };
        serial += 1;
        connection = { memory, serial, variables: [], catalog: null, lastFrame: null };
      }

      const { memory } = connection;
      const header = readLiveHeader(memory);
      if (!isConnected(header)) {
        // Fechar e reabrir no próximo pedido é o que o SDK oficial faz: segurar
        // o handle manteria viva uma região que o sim já abandonou.
        disconnect();
        return { state: 'disconnected' };
      }

      const catalogId = `${connection.serial}:${header.sessionInfoUpdate}`;
      if (connection.catalog?.catalogId !== catalogId) {
        connection.variables = readLiveVariables(memory, header);
        connection.catalog = buildCatalog(
          catalogId,
          header.tickRate,
          connection.variables,
          readLiveSessionInfoText(memory, header),
        );
      }

      // Frame que o sim reescreveu no meio da cópia é descartado; vale o último
      // inteiro. Só na primeira leitura não existe um.
      const frame = freezeLatestFrame(memory) ?? connection.lastFrame;
      if (frame === null) return { state: 'disconnected' };
      connection.lastFrame = frame;

      return {
        state: 'connected',
        catalog: knownCatalogId === catalogId ? null : connection.catalog,
        catalogId,
        tickCount: frame.tickCount,
        values: connection.variables.map((variable) => readLiveValue(frame, variable)),
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
  };
}
