import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dailyForParty, discoveryForParty, partySize, passCost, type PassTable } from './pass';
import ref from '../data/reference.json';

const T: PassTable = ref.passes;

describe('daily admission', () => {
  it('charges one adult $12.25 and a senior $10.75', () => {
    expect(dailyForParty({ adults: 1, seniors: 0, youths: 0 }, T)).toEqual({ cents: 1225, flat: false });
    expect(dailyForParty({ adults: 0, seniors: 1, youths: 0 }, T)).toEqual({ cents: 1075, flat: false });
  });

  it('charges two adults the family/group rate of $24.50, which is the same money', () => {
    expect(dailyForParty({ adults: 2, seniors: 0, youths: 0 }, T).cents).toBe(2450);
  });

  it('caps three adults at the flat $24.50 instead of $36.75', () => {
    expect(dailyForParty({ adults: 3, seniors: 0, youths: 0 }, T)).toEqual({ cents: 2450, flat: true });
  });

  it('keeps the flat rate for 7 people and goes back to one-by-one for 8', () => {
    expect(dailyForParty({ adults: 7, seniors: 0, youths: 0 }, T)).toEqual({ cents: 2450, flat: true });
    expect(dailyForParty({ adults: 8, seniors: 0, youths: 0 }, T)).toEqual({ cents: 9800, flat: false });
  });

  it('makes youth free and charges a youth-only vehicle nothing', () => {
    expect(dailyForParty({ adults: 0, seniors: 0, youths: 3 }, T).cents).toBe(0);
    expect(dailyForParty({ adults: 1, seniors: 0, youths: 4 }, T).cents).toBe(1225);
  });

  it('prices a senior and an adult together at the lower of the two ways', () => {
    // 12.25 + 10.75 = 23.00, under the flat 24.50
    expect(dailyForParty({ adults: 1, seniors: 1, youths: 0 }, T)).toEqual({ cents: 2300, flat: false });
  });
});

describe('Discovery Pass', () => {
  it('costs one adult $83.50 and two adults $167.00, which beats the $167.50 family/group pass', () => {
    expect(discoveryForParty({ adults: 1, seniors: 0, youths: 0 }, T).cents).toBe(8350);
    expect(discoveryForParty({ adults: 2, seniors: 0, youths: 0 }, T)).toEqual({ cents: 16700, flat: false });
  });

  it('uses the family/group pass when it is cheaper: 3 adults', () => {
    expect(discoveryForParty({ adults: 3, seniors: 0, youths: 0 }, T)).toEqual({ cents: 16750, flat: true });
  });
});

describe('the pass line for a trip', () => {
  const two = { adults: 2, seniors: 0, youths: 0 };
  const one = { adults: 1, seniors: 0, youths: 0 };

  it('multiplies the daily rate by the park days the person entered', () => {
    expect(passCost('daily', two, 2, T).cents).toBe(4900);
    expect(passCost('daily', two, 0, T).cents).toBe(0);
  });

  it('picks the Discovery Pass once it is cheaper: one adult breaks even at 6.8 days, so 7', () => {
    expect(passCost('auto', one, 6, T).cents).toBe(7350);
    expect(passCost('auto', one, 7, T).cents).toBe(8350);
    expect(passCost('auto', one, 7, T).basis).toMatch(/^Discovery Pass/);
    expect(passCost('auto', one, 30, T).cents).toBe(8350);
  });

  it('can be told to ignore the pass or to use an amount typed by the person', () => {
    expect(passCost('none', two, 5, T).cents).toBe(0);
    expect(passCost('typed', two, 5, T, 1234).cents).toBe(1234);
  });

  it('warns when the party is too big for one vehicle', () => {
    const r = passCost('daily', { adults: 8, seniors: 0, youths: 0 }, 1, T);
    expect(r.notes.join(' ')).toMatch(/do not fit the family rate/);
    expect(partySize({ adults: 8, seniors: 0, youths: 0 })).toBe(8);
  });

  it('never lowers the pass cost when the park days grow', () => {
    fc.assert(
      fc.property(
        fc.record({ adults: fc.integer({ min: 0, max: 9 }), seniors: fc.integer({ min: 0, max: 9 }), youths: fc.integer({ min: 0, max: 9 }) }),
        fc.constantFrom('auto', 'daily', 'discovery') as fc.Arbitrary<'auto' | 'daily' | 'discovery'>,
        fc.integer({ min: 0, max: 365 }),
        fc.integer({ min: 0, max: 30 }),
        (party, mode, days, more) => {
          expect(passCost(mode, party, days + more, T).cents).toBeGreaterThanOrEqual(passCost(mode, party, days, T).cents);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('never costs more than the daily passes alone when set to cheapest', () => {
    fc.assert(
      fc.property(
        fc.record({ adults: fc.integer({ min: 0, max: 9 }), seniors: fc.integer({ min: 0, max: 9 }), youths: fc.integer({ min: 0, max: 9 }) }),
        fc.integer({ min: 0, max: 365 }),
        (party, days) => {
          const auto = passCost('auto', party, days, T).cents;
          expect(auto).toBeLessThanOrEqual(passCost('daily', party, days, T).cents);
          expect(auto).toBeLessThanOrEqual(passCost('discovery', party, days, T).cents);
        },
      ),
      { numRuns: 2000 },
    );
  });
});
