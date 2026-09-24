import { defineConfig } from 'prisma/config';

/**
 * Configuração do Prisma CLI (migrations, generate, studio).
 *
 * `DATABASE_URL` vem do ambiente. `prisma generate` não precisa dela — só
 * `migrate` e `studio` falam com o banco —, por isso a ausência não quebra a
 * instalação.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
