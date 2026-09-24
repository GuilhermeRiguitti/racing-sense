import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('senha', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hashPassword('senha-do-piloto');

    await expect(verifyPassword('senha-do-piloto', hash)).resolves.toBe(true);
    await expect(verifyPassword('senha-do-piloto!', hash)).resolves.toBe(false);
  });

  it('a mesma senha gera hashes diferentes: o sal é aleatório', async () => {
    expect(await hashPassword('igual')).not.toBe(await hashPassword('igual'));
  });

  it('hash em formato desconhecido é recusado, não quebra', async () => {
    await expect(verifyPassword('qualquer', 'md5$abc')).resolves.toBe(false);
  });
});
