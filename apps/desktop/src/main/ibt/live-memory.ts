import koffi from 'koffi';
import { LIVE_MEMORY_MAP_NAME } from './format.js';
import type { LiveMemory } from './live.js';

/**
 * A memória compartilhada do sim aberta no Windows.
 *
 * É o análogo ao vivo de `openIbtFile`: a única peça que fala com o sistema
 * operacional; o que interpreta os bytes é `live.ts`, puro.
 */
export interface LiveMemoryHandle extends LiveMemory {
  /** Tamanho da região mapeada. Leitura além dele falha antes de tocar a memória. */
  readonly byteLength: number;
  /** Pode ser chamado mais de uma vez. Depois dele, `read` falha. */
  close(): void;
}

/** `FILE_MAP_READ`: a única permissão pedida. O app nunca escreve na região (ADR 0022). */
const FILE_MAP_READ = 0x0004;

interface Kernel32 {
  openFileMapping(access: number, inherit: boolean, name: string): unknown;
  mapViewOfFile(handle: unknown, access: number, high: number, low: number, bytes: number): unknown;
  unmapViewOfFile(address: unknown): boolean;
  closeHandle(handle: unknown): boolean;
  regionSize(address: unknown): number;
}

let kernel32: Kernel32 | undefined;

/**
 * As funções do `kernel32` que a leitura usa, e só elas.
 *
 * Carregadas pelo `koffi` (FFI com binário pronto), sem addon compilado: nada de
 * node-gyp nem Visual Studio Build Tools na máquina de quem desenvolve (ADR 0023).
 *
 * O que **não** está aqui é tão importante quanto o que está: nenhum
 * `OpenProcess`, `ReadProcessMemory` ou `irsdk_broadcastMsg`. Só o arquivo
 * mapeado que o próprio sim publica para leitura.
 */
function loadKernel32(): Kernel32 {
  if (kernel32 !== undefined) return kernel32;

  const lib = koffi.load('kernel32.dll');
  const HANDLE = koffi.pointer('HANDLE', koffi.opaque());
  const MEMORY_BASIC_INFORMATION = koffi.struct('MEMORY_BASIC_INFORMATION', {
    BaseAddress: 'void *',
    AllocationBase: 'void *',
    AllocationProtect: 'uint32_t',
    PartitionId: 'uint16_t',
    RegionSize: 'size_t',
    State: 'uint32_t',
    Protect: 'uint32_t',
    Type: 'uint32_t',
  });

  const openFileMapping = lib.func('__stdcall', 'OpenFileMappingW', HANDLE, [
    'uint32_t',
    'bool',
    'str16',
  ]);
  const mapViewOfFile = lib.func('__stdcall', 'MapViewOfFile', 'void *', [
    HANDLE,
    'uint32_t',
    'uint32_t',
    'uint32_t',
    'size_t',
  ]);
  const unmapViewOfFile = lib.func('__stdcall', 'UnmapViewOfFile', 'bool', ['void *']);
  const closeHandle = lib.func('__stdcall', 'CloseHandle', 'bool', [HANDLE]);
  const virtualQuery = lib.func('__stdcall', 'VirtualQuery', 'size_t', [
    'void *',
    koffi.out(koffi.pointer(MEMORY_BASIC_INFORMATION)),
    'size_t',
  ]);

  kernel32 = {
    openFileMapping: (access, inherit, name) => openFileMapping(access, inherit, name),
    mapViewOfFile: (handle, access, high, low, bytes) =>
      mapViewOfFile(handle, access, high, low, bytes),
    unmapViewOfFile: (address) => unmapViewOfFile(address) as boolean,
    closeHandle: (handle) => closeHandle(handle) as boolean,
    regionSize(address) {
      const info: { RegionSize?: number | bigint } = {};
      const written = virtualQuery(address, info, koffi.sizeof(MEMORY_BASIC_INFORMATION));
      if (written === 0 || info.RegionSize === undefined) {
        throw new Error('VirtualQuery não descreveu a memória compartilhada do iRacing');
      }
      return Number(info.RegionSize);
    },
  };
  return kernel32;
}

/**
 * Abre a memória compartilhada do sim, só leitura.
 *
 * Devolve `null` quando ela não existe: o sim está fechado, ou o app não está no
 * Windows. Não é erro — é o estado normal de quem abre o coach antes de entrar
 * no carro.
 *
 * `name` só muda em teste, para abrir um mapeamento criado pelo próprio teste.
 */
export function openLiveMemory(name: string = LIVE_MEMORY_MAP_NAME): LiveMemoryHandle | null {
  if (process.platform !== 'win32') return null;

  const k32 = loadKernel32();
  const mapping = k32.openFileMapping(FILE_MAP_READ, false, name);
  if (mapping === null) return null;

  const base = k32.mapViewOfFile(mapping, FILE_MAP_READ, 0, 0, 0);
  if (base === null) {
    k32.closeHandle(mapping);
    throw new Error('Não foi possível mapear a memória compartilhada do iRacing');
  }

  let byteLength: number;
  try {
    byteLength = k32.regionSize(base);
  } catch (error) {
    k32.unmapViewOfFile(base);
    k32.closeHandle(mapping);
    throw error;
  }

  let closed = false;
  return {
    byteLength,
    read(offset, length) {
      if (closed) {
        throw new Error('Memória compartilhada do iRacing já fechada');
      }
      // A checagem vem antes da leitura, não depois: ler fora da região mapeada
      // não é leitura curta, é o processo principal caindo.
      if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0) {
        throw new RangeError(`Leitura inválida: ${length} bytes em ${offset}`);
      }
      if (offset + length > byteLength) {
        throw new RangeError(
          `Leitura fora da memória compartilhada: ${length} bytes em ${offset}, região tem ${byteLength}`,
        );
      }
      // `decode` copia. Uma visão direta sobre a memória do sim (`koffi.view`)
      // pouparia a cópia, mas o Electron recusa ArrayBuffer externo, e a cópia
      // é o que congela o frame.
      return koffi.decode(base, offset, 'uint8_t', length) as Uint8Array;
    },
    close() {
      if (closed) return;
      closed = true;
      k32.unmapViewOfFile(base);
      k32.closeHandle(mapping);
    },
  };
}
