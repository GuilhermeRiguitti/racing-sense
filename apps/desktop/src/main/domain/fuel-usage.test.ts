import { describe, expect, it } from 'vitest';
import {
  EMPTY_FUEL_USAGE,
  estimateFuel,
  type FuelSample,
  type FuelUsageState,
  observeFuel,
} from './fuel-usage.js';

const run = (samples: FuelSample[], state: FuelUsageState = EMPTY_FUEL_USAGE) =>
  samples.reduce(observeFuel, state);
const tick = (lapsCompleted: number, fuelLevel: number, onPitRoad = false): FuelSample => ({
  lapsCompleted,
  fuelLevel,
  onPitRoad,
});

describe('combustível por volta', () => {
  it('mede de linha a linha; a volta em que a tela abriu não conta', () => {
    const state = run([tick(3, 50), tick(4, 48), tick(4, 47), tick(5, 45.5), tick(6, 43)]);

    expect(state.stintLaps).toEqual([2.5, 2.5]);
  });

  it('volta que passou pelo box não entra', () => {
    const state = run([tick(1, 50), tick(2, 47), tick(2, 46, true), tick(3, 44), tick(4, 41)]);

    expect(state.stintLaps).toEqual([3]);
  });

  it('reabastecer começa stint nova', () => {
    const state = run([tick(1, 50), tick(2, 47), tick(3, 44), tick(3, 80, true), tick(4, 78)]);

    expect(state.stintLaps).toEqual([]);
  });

  it('volta pulada (tela fechada) não vira uma volta de gasto dobrado', () => {
    const state = run([tick(1, 50), tick(2, 47), tick(4, 41)]);

    expect(state.stintLaps).toEqual([]);
  });

  it('contador que volta é sessão nova', () => {
    const state = run([tick(1, 50), tick(2, 47), tick(3, 44), tick(0, 60)]);

    expect(state.stintLaps).toEqual([]);
  });
});

describe('estimativa', () => {
  it('rende e falta pela média da stint', () => {
    const state = run([tick(0, 53), tick(1, 50), tick(2, 47), tick(3, 43)]);

    const estimate = estimateFuel(state, 20, 10);

    expect(estimate.averageUsage).toBeCloseTo(3.5);
    expect(estimate.lastLapUsage).toBeCloseTo(4);
    expect(estimate.lapsOfFuel).toBeCloseTo(20 / 3.5);
    expect(estimate.fuelToFinish).toBeCloseTo(15);
  });

  it('sem volta medida, sem estimativa — não zero', () => {
    const estimate = estimateFuel(EMPTY_FUEL_USAGE, 20, 10);

    expect(estimate.averageUsage).toBeNull();
    expect(estimate.fuelToFinish).toBeNull();
  });

  it('tanque que basta: nada a pôr', () => {
    const state = run([tick(1, 50), tick(2, 47), tick(3, 44)]);

    expect(estimateFuel(state, 44, 5).fuelToFinish).toBe(0);
  });
});
