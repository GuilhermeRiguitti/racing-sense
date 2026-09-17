/**
 * Abstração da origem dos bytes.
 *
 * É o ponto de troca entre MVP e fase 2: hoje a implementação lê de um arquivo
 * `.ibt`; ao vivo ela lerá da memória compartilhada do sim. Nada mais muda.
 *
 * Implementações concretas ficam em `@telemetry/ingest` — nunca aqui.
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
