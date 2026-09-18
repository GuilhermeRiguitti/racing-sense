/**
 * O mapa de camadas do projeto.
 *
 * Esta é a fonte da verdade da arquitetura — `pnpm arch` reprova o que não
 * estiver aqui. Mudar uma linha deste arquivo é mudar a arquitetura, e isso
 * pede um ADR (ver docs/adr/0009 e 0011).
 *
 * `packages`: o que aquele pacote pode declarar como dependência.
 * `libs`: bibliotecas externas permitidas ("[]" = nenhuma).
 * `builtins`: módulos `node:*` permitidos, pelo nome ("[]" = nenhum).
 *   Não é detalhe: é assim que a cloud-api fica **incapaz de abrir arquivo** —
 *   `node:fs` não está na lista dela (ADR 0016).
 */
export const LAYERS = {
  // ---------- núcleo: não conhece ninguém ----------
  '@telemetry/domain': {
    role: 'domínio',
    packages: [],
    libs: [],
    builtins: [],
  },
  '@telemetry/application': {
    role: 'núcleo da aplicação',
    packages: ['@telemetry/domain'],
    libs: [],
    builtins: [],
  },
  '@telemetry/application-desktop': {
    // Ingestão, decodificação, voltas, análise e publicação. Só o desktop
    // declara este pacote — é o que impede a nuvem de gerar telemetria.
    role: 'aplicação do desktop',
    packages: ['@telemetry/application', '@telemetry/domain'],
    libs: [],
    builtins: [],
  },
  '@telemetry/application-cloud': {
    // Visibilidade, compartilhamento e leitura do que o desktop publicou.
    role: 'aplicação da nuvem',
    packages: ['@telemetry/application', '@telemetry/domain'],
    libs: [],
    builtins: [],
  },
  '@telemetry/contracts': {
    role: 'borda (DTO)',
    packages: ['@telemetry/domain'],
    libs: ['zod'],
    builtins: [],
  },
  '@telemetry/ibt-core': {
    role: 'biblioteca técnica',
    packages: [],
    libs: [],
    builtins: [],
  },

  // ---------- adapters: cada um dono de uma dependência externa ----------
  '@telemetry/adapter-ibt': {
    role: 'adapter do desktop',
    packages: ['@telemetry/application-desktop', '@telemetry/domain', '@telemetry/ibt-core'],
    libs: [],
    builtins: [],
  },
  '@telemetry/adapter-fs': {
    role: 'adapter do desktop',
    packages: ['@telemetry/application-desktop', '@telemetry/domain', '@telemetry/ibt-core'],
    libs: ['chokidar'],
    builtins: ['fs', 'path'],
  },
  '@telemetry/adapter-sqlite': {
    role: 'adapter do desktop',
    packages: ['@telemetry/application-desktop', '@telemetry/domain'],
    libs: ['better-sqlite3'],
    builtins: ['path'],
  },
  '@telemetry/adapter-http': {
    role: 'adapter do desktop',
    packages: ['@telemetry/application-desktop', '@telemetry/contracts', '@telemetry/domain'],
    libs: ['zod'],
    builtins: [],
  },
  '@telemetry/adapter-postgres': {
    role: 'adapter da nuvem',
    packages: ['@telemetry/application-cloud', '@telemetry/domain'],
    libs: ['pg'],
    builtins: [],
  },
  '@telemetry/adapter-llm': {
    role: 'adapter do desktop',
    packages: ['@telemetry/application-desktop', '@telemetry/domain'],
    libs: ['ai', '@ai-sdk/google', '@ai-sdk/openai-compatible'],
    builtins: [],
  },
  '@telemetry/adapter-memory': {
    // Serve os dois lados por ser adapter de teste e de desenvolvimento: ele só
    // implementa portas, nunca expõe caso de uso de um lado para o outro.
    role: 'adapter em memória',
    packages: [
      '@telemetry/application',
      '@telemetry/application-cloud',
      '@telemetry/application-desktop',
      '@telemetry/domain',
    ],
    libs: [],
    builtins: [],
  },

  // ---------- aplicações: cada uma com seu composition root ----------
  '@telemetry/desktop': {
    role: 'composition root do desktop',
    packages: [
      '@telemetry/adapter-fs',
      '@telemetry/adapter-http',
      '@telemetry/adapter-ibt',
      '@telemetry/adapter-llm',
      '@telemetry/adapter-memory',
      '@telemetry/adapter-sqlite',
      '@telemetry/application',
      '@telemetry/application-desktop',
      '@telemetry/contracts',
      '@telemetry/domain',
    ],
    libs: [
      'electron',
      'electron-vite',
      'electron-builder',
      'react',
      'react-dom',
      'vite',
      '@vitejs/plugin-react',
    ],
    builtins: ['path'],
  },
  '@telemetry/cloud-api': {
    // O que está fora desta lista é o ponto (ADR 0016): sem `application-desktop`
    // a nuvem não consegue nomear a ingestão; sem `adapter-ibt`, `adapter-fs` e
    // `ibt-core` ela não lê arquivo de telemetria; sem `adapter-llm` ela não
    // roda modelo. E `builtins` sem `fs` a impede até de abrir arquivo na mão.
    role: 'composition root da nuvem',
    packages: [
      '@telemetry/adapter-memory',
      '@telemetry/adapter-postgres',
      '@telemetry/application',
      '@telemetry/application-cloud',
      '@telemetry/contracts',
      '@telemetry/domain',
    ],
    libs: [
      '@nestjs/common',
      '@nestjs/core',
      '@nestjs/platform-express',
      'iron-session',
      'reflect-metadata',
      'rxjs',
    ],
    builtins: ['crypto', 'http'],
  },
  '@telemetry/web': {
    // Só contracts: a web nunca fala com a máquina do piloto, só com a cloud-api.
    role: 'interface web',
    packages: ['@telemetry/contracts'],
    libs: ['next', 'react', 'react-dom'],
    builtins: [],
  },
};

/**
 * Só o composition root pode importar adapter.
 *
 * Se um caso de uso ou um controller importar adapter direto, a inversão de
 * dependência foi desfeita e trocar a lib volta a ser refatoração.
 *
 * São dois, um por aplicação que roda casos de uso. A web não tem: ela não
 * monta caso de uso nenhum, só consome a cloud-api.
 */
export const ADAPTER_IMPORT_ALLOWLIST = [
  'apps/desktop/src/main/composition-root.ts',
  'apps/cloud-api/src/composition-root.ts',
];
