import type {
  DiscoveredTelemetryFile,
  IngestTelemetryFileHandler,
  TelemetryWatcherPort,
} from '@telemetry/application-desktop';

/**
 * Liga o watcher à ingestão.
 *
 * É a única costura entre "apareceu arquivo" e "virou sessão". Fica no processo
 * principal, e não num caso de uso, porque o que ela administra é assinatura e
 * ciclo de vida — não regra de negócio.
 *
 * Três decisões que valem explicar:
 *
 * 1. **Uma ingestão por vez.** Chegando dez arquivos de uma noite de treino,
 *    processar em paralelo brigaria por CPU com o sim, que pode estar rodando na
 *    mesma máquina. A fila serializa.
 * 2. **Falha de um arquivo não derruba o resto.** Arquivo corrompido, canal
 *    faltando, sessão sem volta completa — tudo isso é comum, e nenhum deles
 *    pode parar a esteira nem fechar o aplicativo.
 * 3. **Arquivo recusado não some.** O watcher já diz o motivo; aqui ele vira
 *    aviso registrado, para o piloto entender por que uma sessão não apareceu.
 */
export interface IngestionService {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface IngestionServiceDeps {
  readonly watcher: TelemetryWatcherPort;
  readonly ingestTelemetryFile: IngestTelemetryFileHandler;
  readonly onIngested?: (file: DiscoveredTelemetryFile, sessionId: string) => void;
  readonly onProblem?: (file: DiscoveredTelemetryFile, reason: string) => void;
}

export function createIngestionService(deps: IngestionServiceDeps): IngestionService {
  const report = deps.onProblem ?? (() => {});
  const announce = deps.onIngested ?? (() => {});

  // Fila de um só: cada arquivo espera o anterior terminar.
  let queue: Promise<void> = Promise.resolve();

  const enqueue = (file: DiscoveredTelemetryFile): void => {
    queue = queue.then(async () => {
      try {
        const sessionId = await deps.ingestTelemetryFile({ locator: file.locator });
        announce(file, sessionId);
      } catch (error) {
        // Hoje isto acontece sempre: o recorte de voltas ainda é stub e lança
        // `NotImplementedError`. Mesmo depois de pronto, arquivo ruim continua
        // sendo rotina — e rotina não pode derrubar o aplicativo do piloto.
        report(file, error instanceof Error ? error.message : 'falha desconhecida na ingestão');
      }
    });
  };

  return {
    async start() {
      deps.watcher.onFileReady(enqueue);
      deps.watcher.onFileRejected((file, reason) => report(file, reason));
      await deps.watcher.start();
    },

    async stop() {
      await deps.watcher.stop();
      // Espera o que já estava na mão terminar: matar no meio deixaria sessão
      // gravada pela metade.
      await queue;
    },
  };
}
