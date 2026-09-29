import koffi from 'koffi';
import { afterAll, describe, expect, it } from 'vitest';
import { openLiveMemory } from './live-memory.js';

/**
 * A ligação com o Windows de verdade, sem o sim.
 *
 * O teste cria um mapeamento próprio, com nome de teste, e o abre pelo mesmo
 * caminho que abre o do iRacing. Prova que `OpenFileMapping`, `MapViewOfFile`,
 * `VirtualQuery` e a cópia funcionam; não prova o layout do sim — esse só a
 * memória do sim aberto prova (docs/pendencias.md).
 */
const onWindows = process.platform === 'win32';
const NAME = `Local\\TelemetryAnalysisTest-${process.pid}`;
const SIZE = 5000;

function createTestMapping(bytes: Uint8Array) {
  const lib = koffi.load('kernel32.dll');
  const create = lib.func('__stdcall', 'CreateFileMappingW', 'void *', [
    'intptr_t',
    'void *',
    'uint32_t',
    'uint32_t',
    'uint32_t',
    'str16',
  ]);
  const map = lib.func('__stdcall', 'MapViewOfFile', 'void *', [
    'void *',
    'uint32_t',
    'uint32_t',
    'uint32_t',
    'size_t',
  ]);
  const unmap = lib.func('__stdcall', 'UnmapViewOfFile', 'bool', ['void *']);
  const close = lib.func('__stdcall', 'CloseHandle', 'bool', ['void *']);

  const INVALID_HANDLE_VALUE = -1;
  const PAGE_READWRITE = 0x04;
  const FILE_MAP_WRITE = 0x02;
  const handle = create(INVALID_HANDLE_VALUE, null, PAGE_READWRITE, 0, bytes.byteLength, NAME);
  const view = map(handle, FILE_MAP_WRITE, 0, 0, 0);
  koffi.encode(view, 0, 'uint8_t', Array.from(bytes), bytes.byteLength);

  return () => {
    unmap(view);
    close(handle);
  };
}

describe.skipIf(!onWindows)('memória compartilhada no Windows', () => {
  const content = new Uint8Array(SIZE).map((_, index) => index % 251);
  const release = onWindows ? createTestMapping(content) : () => undefined;
  afterAll(release);

  it('mapeamento que não existe é sim fechado: null, sem erro', () => {
    expect(openLiveMemory(`${NAME}-inexistente`)).toBeNull();
  });

  it('copia exatamente os bytes pedidos', () => {
    const memory = openLiveMemory(NAME);
    if (memory === null) throw new Error('mapeamento de teste não abriu');
    try {
      expect(memory.byteLength).toBeGreaterThanOrEqual(SIZE);
      expect(Array.from(memory.read(0, 4))).toEqual([0, 1, 2, 3]);
      expect(Array.from(memory.read(300, 3))).toEqual([49, 50, 51]);
    } finally {
      memory.close();
    }
  });

  it('leitura além da região falha antes de tocar a memória', () => {
    const memory = openLiveMemory(NAME);
    if (memory === null) throw new Error('mapeamento de teste não abriu');
    try {
      expect(() => memory.read(memory.byteLength - 2, 4)).toThrow(RangeError);
      expect(() => memory.read(-1, 4)).toThrow(RangeError);
    } finally {
      memory.close();
    }
  });

  it('depois de fechar, ler falha — e fechar de novo não', () => {
    const memory = openLiveMemory(NAME);
    if (memory === null) throw new Error('mapeamento de teste não abriu');
    memory.close();

    expect(() => memory.read(0, 4)).toThrow(/fechada/);
    expect(() => memory.close()).not.toThrow();
  });
});
