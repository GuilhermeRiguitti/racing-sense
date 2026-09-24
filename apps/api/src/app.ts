import 'reflect-metadata';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

/**
 * Monta a aplicação sem subir a porta.
 *
 * O mesmo ponto serve ao servidor (`main.ts`) e à exportação do OpenAPI
 * (`openapi.ts`): o documento que o desktop e a web usam para gerar tipos é
 * exatamente o que o servidor serve em `/docs`.
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });

  // Uma sessão publicada leva as séries de todas as voltas: o limite padrão de
  // 100 KB do Express recusaria qualquer treino de verdade.
  app.useBodyParser('json', { limit: '50mb' });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // A web chama a api do navegador com o cookie de login; o desktop não passa
  // por CORS (a chamada sai do processo principal).
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  app.enableCors({ origin: origins, credentials: true });

  return app;
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Telemetry API')
    .setDescription(
      'Rede social da análise de telemetria: login, sessões publicadas pelo desktop, ' +
        'visibilidade e links de compartilhamento. Não lê telemetria — recebe dado já processado.',
    )
    .setVersion('0.0.0')
    .addCookieAuth('telemetry_session')
    .build();
  return SwaggerModule.createDocument(app, config);
}
