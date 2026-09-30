import { describe, expect, it } from 'vitest';
import { parseLicense, parseSimColor, toCarModel } from './driver.js';

describe('carteira', () => {
  it('lê letra e safety rating do LicString', () => {
    expect(parseLicense('A 3.45', '#0153db')).toEqual({
      letter: 'A',
      safetyRating: 3.45,
      color: '#0153db',
    });
    expect(parseLicense('WC 4.99', null)?.letter).toBe('WC');
  });

  it('texto fora da forma não vira carteira adivinhada', () => {
    expect(parseLicense('', null)).toBeNull();
    expect(parseLicense('A', null)).toBeNull();
    expect(parseLicense(undefined, null)).toBeNull();
  });

  it('cor do sim vira #rrggbb', () => {
    expect(parseSimColor('0xffda59')).toBe('#ffda59');
    expect(parseSimColor('0x0153DB')).toBe('#0153db');
    expect(parseSimColor('0x0')).toBe('#000000');
    expect(parseSimColor('azul')).toBeNull();
  });
});

describe('fabricante do carro', () => {
  it('reconhece o fabricante que abre o nome', () => {
    expect(toCarModel('Ferrari 296 GT3')).toEqual({
      name: 'Ferrari 296 GT3',
      make: { id: 'ferrari', name: 'Ferrari', short: 'FER' },
    });
  });

  it('o alias mais específico vence', () => {
    expect(toCarModel('Mercedes-AMG GT3 2020').make?.id).toBe('mercedes-amg');
  });

  it('fabricante no meio do nome também é reconhecido', () => {
    expect(toCarModel('Global Mazda MX-5 Cup').make?.id).toBe('mazda');
    expect(toCarModel('Super Formula SF23 - Toyota').make?.id).toBe('toyota');
  });

  it('só palavra inteira: sem fabricante, sem marca', () => {
    expect(toCarModel('Minivan Cup').make).toBeNull();
    expect(toCarModel('Skip Barber Formula 2000')).toEqual({
      name: 'Skip Barber Formula 2000',
      make: null,
    });
  });
});
