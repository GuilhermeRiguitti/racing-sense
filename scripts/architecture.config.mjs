/**
 * O mapa de camadas do projeto.
 *
 * Esta é a fonte da verdade da arquitetura — `pnpm arch` reprova o que não
 * estiver aqui. Mudar uma linha deste arquivo é mudar a arquitetura, e isso
 * pede um ADR (ver docs/adr/0009).
 *
 * `packages`: o que aquele pacote pode declarar como dependência.
 * `builtins`: se pode usar `node:*`.
 * `libs`: bibliotecas externas permitidas ("*" = qualquer uma declarada).
 */
export const LAYERS = {
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
  '@telemetry/api': {
    role: 'composition root',
    packages: [
      '@telemetry/adapter-fs',
      '@telemetry/adapter-ibt',
      '@telemetry/adapter-llm',
      '@telemetry/adapter-memory',
      '@telemetry/application',
      '@telemetry/contracts',
      '@telemetry/domain',
    ],
    libs: ['hono', '@hono/node-server'],
    builtins: true,
  },
  '@telemetry/web': {
    role: 'interface',
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
 */
export const ADAPTER_IMPORT_ALLOWLIST = ['apps/api/src/composition-root.ts'];
