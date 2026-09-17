import type { NextConfig } from 'next';

const config: NextConfig = {
  /**
   * Os pacotes internos são publicados como TypeScript (sem build step).
   * O Next precisa transpilá-los — ver docs/adr/0001-monorepo-pnpm.md.
   */
  transpilePackages: ['@telemetry/contracts'],
};

export default config;
