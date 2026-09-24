/**
 * Decidir quando um `.ibt` pode ser lido.
 *
 * Este é o problema real do watcher, e não é sobre formato: enquanto a sessão
 * está rodando, o sim mantém o arquivo aberto e o Windows o trava. Ler cedo
 * demais dá uma de duas coisas, e a segunda é pior:
 *
 *  - `EBUSY`/`EPERM` na abertura — barulhento, fácil de tratar;
 *  - arquivo truncado com header válido — silencioso, vira volta errada.
 *
 * A lógica mora aqui, separada do `chokidar`, porque é ela que precisa de teste
 * de verdade. As dependências entram injetadas para o teste não depender de
 * disco nem de relógio.
 */

/** O que a espera precisa saber fazer. Em produção, `node:fs` e `setTimeout`. */
export interface ReadinessProbe {
  /** Tamanho atual. Lança se o arquivo sumiu. */
  size(path: string): Promise<number>;
  /** Abre e fecha. Lança `EBUSY`/`EPERM` enquanto o sim segura o arquivo. */
  openForRead(path: string): Promise<void>;
  wait(milliseconds: number): Promise<void>;
  /** Milissegundos monotônicos, para o timeout. */
  now(): number;
}

export interface ReadinessOptions {
  /** Medições consecutivas de tamanho igual antes de tentar abrir. */
  readonly stableChecks: number;
  readonly pollIntervalMs: number;
  /** Depois disto o arquivo é recusado, em vez de esperar para sempre. */
  readonly timeoutMs: number;
}

export const DEFAULT_READINESS: ReadinessOptions = {
  stableChecks: 3,
  pollIntervalMs: 1_000,
  timeoutMs: 5 * 60 * 1_000,
};

export type ReadinessResult =
  | { readonly ready: true; readonly sizeBytes: number }
  | { readonly ready: false; readonly reason: string };

const isLockedError = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code;
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
};

/**
 * Espera o arquivo parar de crescer e destravar.
 *
 * Nunca lança: devolve `ready: false` com o motivo. Arquivo que não ficou pronto
 * não é erro do programa — é sessão abandonada, sim travado, disco cheio. Quem
 * chama registra e segue, e o piloto vê o motivo em vez de um arquivo sumido.
 */
export async function waitUntilReadable(
  path: string,
  probe: ReadinessProbe,
  options: ReadinessOptions = DEFAULT_READINESS,
): Promise<ReadinessResult> {
  const deadline = probe.now() + options.timeoutMs;

  let lastSize = -1;
  let stableCount = 0;

  while (probe.now() < deadline) {
    let currentSize: number;
    try {
      currentSize = await probe.size(path);
    } catch (error) {
      // Sumiu no meio: o piloto apagou, ou era arquivo temporário.
      return { ready: false, reason: `não foi possível medir o arquivo: ${describe(error)}` };
    }

    // Arquivo recém-criado tem zero byte e "tamanho estável" em zero não
    // significa pronto — significa que o sim ainda nem começou a escrever.
    stableCount = currentSize > 0 && currentSize === lastSize ? stableCount + 1 : 0;
    lastSize = currentSize;

    if (stableCount >= options.stableChecks) {
      try {
        await probe.openForRead(path);
        return { ready: true, sizeBytes: currentSize };
      } catch (error) {
        if (!isLockedError(error)) {
          return { ready: false, reason: `não foi possível abrir: ${describe(error)}` };
        }
        // Parou de crescer mas continua travado: o sim ainda não soltou.
        // Continuar tentando é o certo — não zeramos a contagem de estabilidade.
      }
    }

    await probe.wait(options.pollIntervalMs);
  }

  return {
    ready: false,
    reason:
      lastSize <= 0
        ? 'arquivo continuou vazio até o tempo limite'
        : `arquivo não estabilizou em ${Math.round(options.timeoutMs / 1000)}s (último tamanho: ${lastSize} bytes)`,
  };
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
