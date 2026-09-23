/**
 * Acesso aos bytes de um arquivo de telemetria, sem dizer de onde eles vêm.
 *
 * Hoje é arquivo em disco. Na fase 2 (telemetria ao vivo) é memória
 * compartilhada, e nenhum caso de uso muda.
 */
/**
 * Uma abertura. Passe de volta a mesma que `open` devolveu: duas aberturas do
 * mesmo arquivo são refs diferentes, e fechar uma não afeta a outra.
 */
export interface TelemetryFileRef {
  /** Identificador estável da origem: caminho, chave, o que o adapter usar. */
  readonly locator: string;
  readonly sizeBytes: number;
}

export interface TelemetryFilePort {
  /** Lê exatamente `length` bytes. Leitura curta é erro, nunca buffer parcial. */
  read(ref: TelemetryFileRef, offset: number, length: number): Promise<Uint8Array>;
  open(locator: string): Promise<TelemetryFileRef>;
  close(ref: TelemetryFileRef): Promise<void>;
}
