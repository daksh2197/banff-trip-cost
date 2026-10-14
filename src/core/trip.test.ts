import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareQuotes } from './compare';
import { costQuote, rankQuotes, tripKm, type Quote, type TripShared } from './trip';

const shared: TripShared = { km: 260, priceMills: 1700, passCents: 4900, kpassCents: 0 };

const A: Quote = { id: '0', label: 'A', dailyRateCents: 5500, days: 4, feesCents: 9500, l100Hundredths: 750, extras: [] };
const B: Quote = {
  id: '1',
  label: 'B',
  dailyRateCents: 7200,
  days: 4,
  feesCents: 13000,
  l100Hundredths: 1050,
  extras: [{ label: 'Winter tires', cents: 6000 }],
};

describe('one quote over a trip', () => {
  it('adds every line: A is 220.00 + 95.00 + 33.15 + 49.00 = 397.15', () => {
    const c = costQuote(A, shared);
    expect(c.lines).toEqual({ rental: 22000, fees: 9500, fuel: 3315, pass: 4900, kpass: 0, extras: 0 });
    expect(c.totalCents).toBe(39715);
    expect(c.perDayCents).toBe(9929); // 397.15 / 4 = 99.2875 -> 99.29
  });

  it('adds the winter extras: B is 288.00 + 130.00 + 46.41 + 49.00 + 60.00 = 573.41', () => {
    const c = costQuote(B, shared);
    expect(c.lines.fuel).toBe(4641); // 260 x 10.5 / 100 = 27.3 L x 1.70
    expect(c.totalCents).toBe(57341);
  });

  it('lets a discount line lower the total', () => {
    const c = costQuote({ ...A, extras: [{ label: 'Promo', cents: -1000 }] }, shared);
    expect(c.totalCents).toBe(38715);
  });

  it('turns a one-way distance into a round trip plus extra driving', () => {
    expect(tripKm(130, 0)).toBe(260);
    expect(tripKm(130, 45)).toBe(305);
  });

  it('never lowers any quote total when the distance grows', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20_000 }), fc.integer({ min: 0, max: 5000 }), (km, more) => {
        expect(costQuote(B, { ...shared, km: km + more }).totalCents).toBeGreaterThanOrEqual(costQuote(B, { ...shared, km }).totalCents);
      }),
      { numRuns: 1000 },
    );
  });

  it('keeps the total equal to the sum of its lines', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: -50_000, max: 100_000 }),
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 1, max: 5000 }),
        (rate, days, fees, l100, price) => {
          const c = costQuote({ ...A, dailyRateCents: rate, days, feesCents: fees, l100Hundredths: l100 }, { ...shared, priceMills: price });
          const sum = Object.values(c.lines).reduce((a, b) => a + b, 0);
          expect(c.totalCents).toBe(sum);
          expect(Number.isSafeInteger(c.perDayCents)).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe('ranking', () => {
  const cost = (id: string, label: string, total: number) => ({ ...costQuote({ ...A, id, label }, shared), totalCents: total });

  it('puts the cheapest first', () => {
    const r = rankQuotes([cost('0', 'x', 500), cost('1', 'y', 300), cost('2', 'z', 400)]);
    expect(r.map((q) => q.label)).toEqual(['y', 'z', 'x']);
    expect(r.map((q) => q.rank)).toEqual([1, 2, 3]);
  });

  it('keeps tied quotes in the order they were entered and gives them the same rank', () => {
    const r = rankQuotes([cost('0', 'x', 300), cost('1', 'y', 300), cost('2', 'z', 200), cost('3', 'w', 300)]);
    expect(r.map((q) => q.label)).toEqual(['z', 'x', 'y', 'w']);
    expect(r.map((q) => q.rank)).toEqual([1, 2, 2, 2]);
  });

  it('copes with no quotes and with one', () => {
    expect(rankQuotes([])).toEqual([]);
    expect(rankQuotes([cost('0', 'x', 1)]).map((q) => q.rank)).toEqual([1]);
  });

  it('copes with ten or more quotes', () => {
    const many = Array.from({ length: 25 }, (_, i) => cost(String(i), `q${i}`, (i * 7919) % 1000));
    const r = rankQuotes(many);
    expect(r).toHaveLength(25);
    for (let i = 1; i < r.length; i++) expect(r[i]!.totalCents).toBeGreaterThanOrEqual(r[i - 1]!.totalCents);
  });
});

describe('the comparison sentence', () => {
  it('names the line with the biggest gap and which way it goes', () => {
    const a = costQuote(A, shared);
    const b = costQuote(B, shared);
    const c = compareQuotes(a, b);
    // B - A: rental +6800, fees +3500, fuel +1326, extras +6000 -> rental is the biggest
    expect(c.deltas).toEqual({ rental: 6800, fees: 3500, fuel: 1326, extras: 6000 });
    expect(c.totalDelta).toBe(17626);
    expect(c.sentence).toBe(
      "A costs $176.26 less than B over the whole trip. The biggest gap is the rental itself (daily rate times days): A's is $68.00 lower.",
    );
  });

  it('works the other way round when the first quote is the dearer one', () => {
    const c = compareQuotes(costQuote(B, shared), costQuote(A, shared));
    expect(c.sentence).toMatch(/^A costs \$176\.26 less than B/);
  });

  it('says there is no difference when the quotes are the same', () => {
    const a = costQuote(A, shared);
    expect(compareQuotes(a, { ...a, label: 'copy' }).sentence).toBe('No difference: both come to $397.15 for the trip.');
  });

  it('says the split differs when totals tie but lines do not', () => {
    const a = costQuote(A, shared);
    const b = { ...a, lines: { ...a.lines, rental: a.lines.rental + 500, fees: a.lines.fees - 500 } };
    expect(compareQuotes(a, b).sentence).toBe('Same total of $397.15, but the lines are split differently.');
  });

  it('can say the cheaper quote is cheaper overall while dearer on one line', () => {
    const a = costQuote(A, shared);
    const b = { ...a, label: 'B', totalCents: a.totalCents - 100, lines: { ...a.lines, rental: a.lines.rental - 900, fuel: a.lines.fuel + 800 } };
    const s = compareQuotes(a, b).sentence;
    expect(s).toMatch(/^B costs \$1\.00 less than A/);
    expect(s).toMatch(/rental itself.*B's is \$9\.00 lower/);
  });

  it('uses a plain name when a label is blank', () => {
    const a = { ...costQuote(A, shared), label: '  ' };
    const b = costQuote(B, shared);
    expect(compareQuotes(a, b).sentence).toMatch(/^Quote A costs/);
  });
});
