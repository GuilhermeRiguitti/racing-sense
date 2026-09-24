import type { NextConfig } from 'next';

/**
 * A web depende só da api: lê e escreve por HTTP, com os tipos gerados do
 * OpenAPI (`src/lib/api-schema.d.ts`). Não importa código de nenhuma outra
 * aplicação do repositório.
 */
const config: NextConfig = {
  // A raiz do build é esta pasta, não a do repositório: cada aplicação tem o
  // próprio lockfile e o próprio node_modules, e a web builda sozinha.
  turbopack: { root: import.meta.dirname },
};

export default config;
