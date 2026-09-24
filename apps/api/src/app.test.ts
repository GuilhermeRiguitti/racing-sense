import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createOpenApiDocument } from './app.js';

/**
 * A api montada de verdade, sem banco.
 *
 * Pega o que nenhum teste de função pura pega: injeção de dependência e
 * validação dependem dos metadados de decorator. Um `import type` numa classe
 * injetada ou num DTO apaga esses metadados — o Nest não sobe, ou pior, o
 * `ValidationPipe` deixa de validar sem avisar.
 */
let app: NestExpressApplication;
let base = '';

beforeAll(async () => {
  process.env.SESSION_SECRET ??= 'segredo-de-teste-com-pelo-menos-32-caracteres';
  app = await createApp();
  await app.listen(0);
  base = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('api montada', () => {
  it('valida o corpo antes de chegar no banco', async () => {
    const resposta = await post('/auth/register', { email: 'não é e-mail' });

    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as { message: string[] };
    expect(corpo.message.join(' ')).toMatch(/email/);
  });

  it('rota que exige login responde 401 sem cookie', async () => {
    expect((await fetch(`${base}/auth/me`)).status).toBe(401);
    expect((await post('/sessions', {})).status).toBe(401);
  });

  it('o documento OpenAPI tem as rotas que desktop e web usam', () => {
    const paths = Object.keys(createOpenApiDocument(app).paths);

    expect(paths).toEqual(
      expect.arrayContaining(['/auth/session', '/auth/me', '/sessions', '/sessions/public']),
    );
  });
});
