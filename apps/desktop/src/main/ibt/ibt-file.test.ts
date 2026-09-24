import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MemoryByteSource } from './byte-source.js';
import { openIbtFile } from './ibt-file.js';

const pastas: string[] = [];

afterAll(async () => {
  await Promise.all(pastas.map((pasta) => rm(pasta, { recursive: true, force: true })));
});

async function arquivoCom(bytes: Uint8Array): Promise<string> {
  const pasta = await mkdtemp(join(tmpdir(), 'telemetria-'));
  pastas.push(pasta);
  const caminho = join(pasta, 'sessao.ibt');
  await writeFile(caminho, bytes);
  return caminho;
}

/**
 * A leitura de bytes é exercitada através do decoder, que é quem a usa. Um
 * header truncado é o jeito mais curto de pedir bytes que não existem.
 */
describe('openIbtFile', () => {
  it('informa o tamanho do arquivo aberto', async () => {
    const arquivo = await openIbtFile(await arquivoCom(new Uint8Array(10)));

    expect(arquivo.sizeBytes).toBe(10);
    await arquivo.close();
  });

  it('leitura além do fim falha em vez de devolver pedaço', async () => {
    // Menor que o header de 112 bytes: o decoder pede bytes que não existem.
    const arquivo = await openIbtFile(await arquivoCom(new Uint8Array(40)));

    await expect(arquivo.readTechnicalMetadata()).rejects.toThrow(/fora dos limites/);
    await arquivo.close();
  });

  it('fechar duas vezes não falha, e ler depois de fechar falha', async () => {
    const arquivo = await openIbtFile(await arquivoCom(new Uint8Array(200)));

    await arquivo.close();
    await expect(arquivo.close()).resolves.toBeUndefined();
    await expect(arquivo.readTechnicalMetadata()).rejects.toThrow(/já fechado/);
  });

  it('arquivo que não existe falha na abertura', async () => {
    await expect(openIbtFile(join(tmpdir(), 'nao-existe-mesmo.ibt'))).rejects.toThrow();
  });
});

describe('MemoryByteSource', () => {
  it('lê exatamente os bytes pedidos, na posição pedida', async () => {
    const fonte = new MemoryByteSource(Uint8Array.from([1, 2, 3, 4, 5]));

    expect([...(await fonte.read(1, 3))]).toEqual([2, 3, 4]);
    await expect(fonte.read(3, 5)).rejects.toThrow(RangeError);
  });
});
