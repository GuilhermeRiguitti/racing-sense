import type { NextConfig } from 'next';

const config: NextConfig = {
  /**
   * Os pacotes internos são publicados como TypeScript (sem build step).
   * O Next precisa transpilá-los — ver docs/adr/0001-monorepo-pnpm.md.
   *
   * A web depende só de `contracts`: ela lê a cloud-api e nunca monta caso de
   * uso nem fala com a máquina do piloto (ADR 0011).
   */
  transpilePackages: ['@telemetry/contracts'],
};

export default config;
