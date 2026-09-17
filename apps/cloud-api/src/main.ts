import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DomainExceptionFilter } from './http/error-filter.js';
import { AppModule } from './modules/app.module.js';

const port = Number(process.env.PORT ?? 4000);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(port);
  console.log(`cloud-api ouvindo em http://localhost:${port}`);
}

void bootstrap();
