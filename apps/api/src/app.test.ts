import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('createApp', () => {
  it('responde ao health check', async () => {
    const response = await createApp().request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('marca rota ainda não implementada com 501, não com 404', async () => {
    const response = await createApp().request('/sessions');
    expect(response.status).toBe(501);
  });
});
