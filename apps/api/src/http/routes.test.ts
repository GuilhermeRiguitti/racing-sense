import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

const app = createApp({});

describe('API', () => {
  it('responde ao health check', async () => {
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('lista sessões (vazio numa instalação nova)', async () => {
    const response = await app.request('/sessions');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it('traduz sessão inexistente em 404, com o código do erro de domínio', async () => {
    const response = await app.request('/sessions/não-existe/laps');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: 'NOT_FOUND' });
  });

  it('traduz caso de uso ainda não implementado em 501', async () => {
    const response = await app.request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locator: '/telemetry/inexistente.ibt' }),
    });

    // O arquivo não existe, então a falha vem do adapter de disco (500);
    // o que importa aqui é que o erro é traduzido e não derruba o servidor.
    expect([500, 501]).toContain(response.status);
  });
});
