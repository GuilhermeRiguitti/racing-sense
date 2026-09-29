import { describe, expect, it } from 'vitest';
import { IncompatibleReferenceError } from './errors.js';
import { assertComparable, isComparableWith } from './reference-lap.js';
import { aCar, aReferenceLap, aTrack } from '../../../tests/support/builders.js';

describe('compatibilidade da volta de referência', () => {
  const reference = aReferenceLap();

  it('aceita mesma pista e mesmo carro', () => {
    expect(isComparableWith(reference, { track: aTrack(), car: aCar() })).toBe(true);
    expect(() => assertComparable(reference, { track: aTrack(), car: aCar() })).not.toThrow();
  });

  it('recusa pista diferente', () => {
    const outraPista = { track: aTrack({ id: 'spa', name: 'Spa-Francorchamps' }), car: aCar() };

    expect(isComparableWith(reference, outraPista)).toBe(false);
    expect(() => assertComparable(reference, outraPista)).toThrow(IncompatibleReferenceError);
  });

  it('recusa carro diferente — o delta existiria e não significaria nada', () => {
    const outroCarro = { track: aTrack(), car: aCar({ id: 'porsche992cup', name: 'Porsche 992' }) };

    expect(() => assertComparable(reference, outroCarro)).toThrow(IncompatibleReferenceError);
  });
});
