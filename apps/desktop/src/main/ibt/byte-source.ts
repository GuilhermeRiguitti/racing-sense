/**
 * Abstração da origem dos bytes.
 *
 * A implementação sobre disco é `openIbtFile`, em `ibt-file.ts`.
 *
 * A memória compartilhada do sim tem o mesmo header e a mesma tabela de
 * variáveis, mas não usa esta interface: lá a leitura é síncrona e o frame
 * precisa ser congelado — ver `LiveMemory`, em `live.ts`.
 */
export interface ByteSource {
  /**
   * Tamanho total, quando conhecido. Uma fonte ao vivo pode não saber
   * (o sim continua escrevendo), e aí retorna `undefined`.
   */
  readonly byteLength: number | undefined;

  /**
   * Lê exatamente `length` bytes a partir de `offset`.
   * Deve rejeitar se não houver bytes suficientes — leitura curta silenciosa
   * vira amostra corrompida lá na frente.
   */
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** Fonte sobre bytes já em memória. Útil em teste e para arquivos pequenos. */
export class MemoryByteSource implements ByteSource {
  constructor(private readonly bytes: Uint8Array) {}

  get byteLength(): number {
    return this.bytes.byteLength;
  }

  read(offset: number, length: number): Promise<Uint8Array> {
    const end = offset + length;
    if (offset < 0 || end > this.bytes.byteLength) {
      return Promise.reject(
        new RangeError(
          `Leitura fora dos limites: pedidos ${length} bytes em ${offset}, fonte tem ${this.bytes.byteLength}`,
        ),
      );
    }
    return Promise.resolve(this.bytes.subarray(offset, end));
  }
}
