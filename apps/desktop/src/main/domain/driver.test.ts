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
  it('separa fabricante e modelo quando o nome começa pela marca', () => {
    expect(toCarModel('Ferrari 296 GT3')).toMatchObject({
      make: { name: 'Ferrari', short: 'FER' },
      model: '296 GT3',
    });
  });

  it('o alias mais específico vence', () => {
    expect(toCarModel('Mercedes-AMG GT3 2020')).toMatchObject({
      make: { short: 'AMG' },
      model: 'GT3 2020',
    });
  });

  it('fabricante no meio do nome: a marca é reconhecida, o nome fica inteiro', () => {
    expect(toCarModel('Global Mazda MX-5 Cup')).toMatchObject({
      make: { name: 'Mazda' },
      model: 'Global Mazda MX-5 Cup',
    });
    expect(toCarModel('Super Formula SF23 - Toyota').make?.name).toBe('Toyota');
  });

  it('só palavra inteira: sem fabricante, sem marca', () => {
    expect(toCarModel('Minivan Cup').make).toBeNull();
    expect(toCarModel('Skip Barber Formula 2000')).toMatchObject({
      make: null,
      model: 'Skip Barber Formula 2000',
    });
  });
});
