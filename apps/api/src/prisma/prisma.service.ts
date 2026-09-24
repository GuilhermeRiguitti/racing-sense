import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * O cliente do Prisma como provider do Nest.
 *
 * A conexão abre na primeira consulta, não no boot: exportar o OpenAPI
 * (`pnpm openapi`) monta a aplicação inteira sem precisar de banco de pé.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
