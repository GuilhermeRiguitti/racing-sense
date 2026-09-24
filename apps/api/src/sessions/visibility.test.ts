import { describe, expect, it } from 'vitest';
import { canView, type ShareableSession, type Visibility } from './visibility.js';

const dono = 'piloto-1';
const outro = 'piloto-2';
const token = 'token-abc';
const agora = new Date('2026-09-17T12:00:00Z');

const sessao = (visibility: Visibility, revokedAt: Date | null = null): ShareableSession => ({
  ownerId: dono,
  visibility,
  shareLinks: [{ token, createdAt: new Date('2026-09-01T00:00:00Z'), revokedAt }],
});

describe('canView', () => {
  it('o dono vê a própria sessão em qualquer visibilidade', () => {
    for (const visibility of ['private', 'unlisted', 'public'] as const) {
      expect(canView(sessao(visibility), { pilotId: dono, shareToken: null }, agora)).toBe(true);
    }
  });

  it('sessão pública é visível até para quem não está logado', () => {
    expect(canView(sessao('public'), { pilotId: null, shareToken: null }, agora)).toBe(true);
  });

  it('sessão privada não abre nem para outro piloto logado', () => {
    expect(canView(sessao('private'), { pilotId: outro, shareToken: null }, agora)).toBe(false);
  });

  it('link abre sessão não listada', () => {
    expect(canView(sessao('unlisted'), { pilotId: outro, shareToken: token }, agora)).toBe(true);
  });

  it('sem o link, sessão não listada continua fechada', () => {
    expect(canView(sessao('unlisted'), { pilotId: outro, shareToken: null }, agora)).toBe(false);
  });

  it('link revogado deixa de abrir', () => {
    const revogado = sessao('unlisted', new Date('2026-09-10T00:00:00Z'));

    expect(canView(revogado, { pilotId: outro, shareToken: token }, agora)).toBe(false);
  });

  it('voltar para privado invalida quem já tinha o link', () => {
    // Se "tornar privado" não fechasse para quem já tem o link, não significaria nada.
    expect(canView(sessao('private'), { pilotId: outro, shareToken: token }, agora)).toBe(false);
  });

  it('link de outra sessão não abre esta', () => {
    const comOutroToken = { pilotId: outro, shareToken: 'token-de-outra' };

    expect(canView(sessao('unlisted'), comOutroToken, agora)).toBe(false);
  });
});
