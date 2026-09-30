import { describe, expect, it } from 'vitest';
import { CAR_MAKE_IDS } from '../../../main/domain/driver.js';
import { LOGO_IDS, makeLogo } from './make-logo.js';

describe('logos dos fabricantes', () => {
  it('todo arquivo em logos/ tem o nome de um fabricante reconhecido', () => {
    // Arquivo com nome errado nunca aparece no overlay, e ninguém percebe.
    expect(LOGO_IDS.filter((id) => !CAR_MAKE_IDS.includes(id))).toEqual([]);
  });

  it('fabricante sem arquivo não tem logo: o overlay mostra a sigla', () => {
    expect(makeLogo('fabricante-que-nao-existe')).toBeNull();
  });
});
