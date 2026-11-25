import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blankStay, evaluateStays, sampleStayTrip, staySentence, type PricedStay, type StayTrip } from './stay';
import { decodeStay, encodeStay } from './share';

const trip = (stays: StayTrip['stays'], extra: Partial<StayTrip> = {}): StayTrip => ({ people: '', l100: '', fuel: '', stays, ...extra });
const stay = (o: Partial<ReturnType<typeof blankStay>>) => ({ ...blankStay(1, 'hotel'), ...o });

describe('evaluateStays', () => {
  it('asks for the rate and nights', () => {
    const r = evaluateStays(trip([blankStay(1, 'hotel')]));
    expect(r.ranked).toHaveLength(0);
    const s = r.stays[0]!;
    expect(s.ok).toBe(false);
    if (!s.ok) expect(Object.keys(s.errors).sort()).toEqual(['nights', 'rate']);
  });

  it('adds rate times nights, fees, taxes, parking and food per night', () => {
    // 3 x $200 + $150 fees + $90 taxes + 3 x $20 parking + 3 x $100 food = $1,200
    const r = evaluateStays(trip([stay({ rate: '200', nights: '3', fees: '150', taxes: '90', parking: '20', food: '100' })], { people: '4' }));
    const p = r.ranked[0]!;
    expect(p.total).toBe(120_000);
    expect(p.perNight).toBe(40_000);
    expect(p.perPersonNight).toBe(10_000);
  });

  it('prices the extra driving with the trip fuel use and price', () => {
    // 50 km a day x 3 nights = 150 km at 8 L/100 km = 12 L at $1.500 = $18.00
    const r = evaluateStays(trip([stay({ rate: '100', nights: '3', km: '50' })], { l100: '8', fuel: '1.50' }));
    expect(r.ranked[0]!.lines.driving).toBe(1_800);
  });

  it('asks for fuel use and price when any stay has extra driving', () => {
    const r = evaluateStays(trip([stay({ rate: '100', nights: '3', km: '50' })]));
    expect(r.shared.errors.l100).toBeTruthy();
    expect(r.shared.errors.fuel).toBeTruthy();
    expect(r.ranked).toHaveLength(0);
  });

  it('ranks cheapest first and keeps the typed order on ties', () => {
    const r = evaluateStays(
      trip([stay({ label: 'A', rate: '300', nights: '2' }), stay({ label: 'B', rate: '200', nights: '2' }), stay({ label: 'C', rate: '200', nights: '2' })]),
    );
    expect(r.ranked.map((s) => s.label)).toEqual(['B', 'C', 'A']);
  });

  it('shows no per-person figure without a head count', () => {
    expect(evaluateStays(trip([stay({ rate: '100', nights: '1' })])).ranked[0]!.perPersonNight).toBeNull();
  });

  it('total is always the sum of its lines', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2000 }),
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 0, max: 900 }),
        fc.integer({ min: 0, max: 300 }),
        (rate, nights, fees, food) => {
          const r = evaluateStays(trip([stay({ rate: String(rate), nights: String(nights), fees: String(fees), food: String(food) })]));
          const p = r.ranked[0]!;
          expect(p.total).toBe(Object.values(p.lines).reduce((a, b) => a + b, 0));
          expect(p.total).toBe((rate * nights + fees + food * nights) * 100);
        },
      ),
    );
  });

  it('prices the sample', () => {
    const r = evaluateStays(sampleStayTrip());
    expect(r.ranked).toHaveLength(2);
  });
});

describe('staySentence', () => {
  it('names the biggest gap', () => {
    const r = evaluateStays(trip([stay({ label: 'Hotel', rate: '250', nights: '2', food: '150' }), stay({ label: 'Rental', rate: '200', nights: '2', fees: '200', food: '80' })]));
    const [a, b] = r.ranked as [PricedStay, PricedStay];
    // Hotel: 500 + 300 = 800. Rental: 400 + 200 + 160 = 760.
    expect(staySentence(a, b)).toBe('Rental costs $40.00 less than Hotel over the stay. The biggest gap is fees: $200.00 more for Rental.');
  });
});

describe('stay links', () => {
  it('round-trips the sample', () => {
    const t = sampleStayTrip();
    expect(decodeStay(`#${encodeStay(t)}`)).toEqual(t);
  });
  it('never throws and refuses junk', () => {
    expect(decodeStay('#nope')).toBeNull();
    fc.assert(fc.property(fc.string({ maxLength: 200 }), (s) => void expect(() => decodeStay(`#t=v1.${s}`)).not.toThrow()));
  });
});
