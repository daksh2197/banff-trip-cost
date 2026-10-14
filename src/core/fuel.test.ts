import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fuelCostCents, litresUsed } from './fuel';

describe('fuel cost', () => {
  it('works the hand example: 260 km at 8.0 L/100 km is 20.8 L, and at $1.80 a litre is $37.44', () => {
    expect(litresUsed(260, 800)).toBeCloseTo(20.8, 10);
    expect(fuelCostCents(260, 800, 1800)).toBe(3744);
  });

  it('works a second example: 260 km at 7.5 L/100 km and $1.70 is 19.5 L and $33.15', () => {
    expect(litresUsed(260, 750)).toBe(19.5);
    expect(fuelCostCents(260, 750, 1700)).toBe(3315);
  });

  it('uses the highway rating, not the combined one, when asked: 520 km at 6.9 vs 8.1 and $1.659', () => {
    // 520 x 6.9 / 100 = 35.88 L x 1.659 = 59.5249 -> 5952 cents
    expect(fuelCostCents(520, 690, 1659)).toBe(5952);
    // 520 x 8.1 / 100 = 42.12 L x 1.659 = 69.88 -> 6988 cents
    expect(fuelCostCents(520, 810, 1659)).toBe(6988);
  });

  it('rounds to the nearest cent, and a half cent goes up', () => {
    // 50 km at 1.00 L/100 km is 0.5 L; at $1.001 that is 50.05 cents -> 50
    expect(fuelCostCents(50, 100, 1001)).toBe(50);
    // 1 km at 1.00 L/100 km is 0.01 L; at $0.500 that is exactly half a cent -> 1
    expect(fuelCostCents(1, 100, 500)).toBe(1);
    // one mill less and it is under half a cent -> 0
    expect(fuelCostCents(1, 100, 499)).toBe(0);
  });

  it('costs nothing for no distance', () => {
    expect(fuelCostCents(0, 800, 1800)).toBe(0);
  });

  it('never lowers the cost when the distance grows', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        fc.integer({ min: 1, max: 6000 }),
        fc.integer({ min: 1, max: 10_000 }),
        (km, more, l100, price) => {
          expect(fuelCostCents(km + more, l100, price)).toBeGreaterThanOrEqual(fuelCostCents(km, l100, price));
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('never lowers the cost when the fuel use or the price grows', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1, max: 9000 }),
        fc.integer({ min: 0, max: 1000 }),
        (km, l100, dl, price, dp) => {
          const base = fuelCostCents(km, l100, price);
          expect(fuelCostCents(km, l100 + dl, price)).toBeGreaterThanOrEqual(base);
          expect(fuelCostCents(km, l100, price + dp)).toBeGreaterThanOrEqual(base);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('is linear in the price: doubling the price doubles the cost, within the half-cent of rounding', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50_000 }), fc.integer({ min: 1, max: 6000 }), fc.integer({ min: 1, max: 5000 }), (km, l100, price) => {
        const one = fuelCostCents(km, l100, price);
        const two = fuelCostCents(km, l100, price * 2);
        expect(Math.abs(two - 2 * one)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 2000 },
    );
  });

  it('matches exact fraction arithmetic on random inputs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50_000 }), fc.integer({ min: 1, max: 6000 }), fc.integer({ min: 1, max: 10_000 }), (km, l100, price) => {
        const exact = (BigInt(km) * BigInt(l100) * BigInt(price) * 2n + 100_000n) / 200_000n;
        expect(BigInt(fuelCostCents(km, l100, price))).toBe(exact);
      }),
      { numRuns: 3000 },
    );
  });
});
