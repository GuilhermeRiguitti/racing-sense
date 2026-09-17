/**
 * O mapa de camadas do projeto.
 *
 * Esta é a fonte da verdade da arquitetura — `pnpm arch` reprova o que não
 * estiver aqui. Mudar uma linha deste arquivo é mudar a arquitetura, e isso
 * pede um ADR (ver docs/adr/0009 e 0011).
 *
 * `packages`: o que aquele pacote pode declarar como dependência.
 * `builtins`: se pode usar `node:*`.
 * `libs`: bibliotecas externas permitidas ("[]" = nenhuma).
 */
export const LAYERS = {
  // ---------- núcleo: não conhece ninguém ----------
  '@telemetry/domain': {
    role: 'domínio',
    packages: [],
    libs: [],
    builtins: false,
  },
  '@telemetry/application': {
    role: 'aplicação',
    packages: ['@telemetry/domain'],
    libs: [],
    builtins: false,
  },
  '@telemetry/contracts': {
    role: 'borda (DTO)',
    packages: ['@telemetry/domain'],
    libs: ['zod'],
    builtins: false,
  },
  '@telemetry/ibt-core': {
    role: 'biblioteca técnica',
    packages: [],
    libs: [],
    builtins: false,
  },

  // ---------- adapters: cada um dono de uma dependência externa ----------
  '@telemetry/adapter-ibt': {
    role: 'adapter',
    packages: ['@telemetry/application', '@telemetry/domain', '@telemetry/ibt-core'],
    libs: [],
    builtins: false,
  },
  '@telemetry/adapter-fs': {
    role: 'adapter',
    packages: ['@telemetry/application', '@telemetry/domain', '@telemetry/ibt-core'],
    libs: ['chokidar'],
    builtins: true,
  },
  '@telemetry/adapter-sqlite': {
    role: 'adapter',
    packages: ['@telemetry/application', '@telemetry/domain'],
    libs: ['better-sqlite3'],
    builtins: true,
  },
  '@telemetry/adapter-http': {
    role: 'adapter',
    packages: ['@telemetry/application', '@telemetry/contracts', '@telemetry/domain'],
    libs: ['zod'],
    builtins: false,
  },
  '@telemetry/adapter-postgres': {
    role: 'adapter',
    packages: ['@telemetry/application', '@telemetry/domain'],
    libs: ['pg'],
    builtins: false,
  },
  '@telemetry/adapter-llm': {
    role: 'adapter',
    packages: ['@telemetry/application', '@telemetry/domain'],
    libs: ['ai', '@ai-sdk/google', '@ai-sdk/openai-compatible'],
    builtins: false,
  },
  '@telemetry/adapter-memory': {
    role: 'adapter',
    packages: ['@telemetry/application', '@telemetry/domain'],
    libs: [],
    builtins: false,
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
    builtins: true,
  },
  '@telemetry/cloud-api': {
    // A LLM **não** entra aqui: análise com modelo é do desktop (ADR 0011).
    // `adapter-llm` fora desta lista faz o `pnpm arch` reprovar quem tentar.
    role: 'composition root da nuvem',
    packages: [
      '@telemetry/adapter-memory',
      '@telemetry/adapter-postgres',
      '@telemetry/application',
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
    builtins: true,
  },
  '@telemetry/web': {
    // Só contracts: a web nunca fala com a máquina do piloto, só com a cloud-api.
    role: 'interface web',
    packages: ['@telemetry/contracts'],
    libs: ['next', 'react', 'react-dom'],
    builtins: false,
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
