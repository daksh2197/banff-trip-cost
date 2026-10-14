import { describe, expect, it } from 'vitest';
import ref from '../data/reference.json';
import { evaluate, type Reference } from './evaluate';
import { emptyState, sampleState, type FormState } from './state';

const R = ref as unknown as Reference;
const text = (v: number | null) => String(v);

function withQuote(patch: Partial<FormState['quotes'][number]>, trip: Partial<FormState> = {}): FormState {
  const s = sampleState();
  s.quotes = [{ ...s.quotes[0]!, ...patch }];
  return { ...s, ...trip };
}

describe('the sample trip', () => {
  it('prices both sample quotes and ranks the cheaper first', () => {
    const e = evaluate(sampleState(), R);
    expect(e.trip.km).toBe(260);
    expect(e.trip.pass?.cents).toBe(4900);
    expect(e.ranked.map((q) => [q.label, q.totalCents, q.rank])).toEqual([
      ['Sample A: small car', 39715, 1],
      ['Sample B: SUV with winter tires', 57341, 2],
    ]);
  });

  it('checks the shared trip numbers one by one', () => {
    const e = evaluate(sampleState(), R);
    expect(e.trip.shared).toEqual({ km: 260, priceMills: 1700, passCents: 4900, kpassCents: 0 });
  });
});

describe('what is missing', () => {
  it('shows nothing priced and a blank problem for each empty box on a clean form', () => {
    const e = evaluate(emptyState(), R);
    expect(e.ranked).toEqual([]);
    expect(e.trip.problems['fuelPrice']).toEqual({ blank: true, message: 'Enter the fuel price per litre.' });
    expect(e.quotes[0]!.problems['rate']?.blank).toBe(true);
    expect(e.quotes[0]!.problems['days']?.blank).toBe(true);
    expect(e.quotes[0]!.problems['l100']?.blank).toBe(true);
    expect(e.quotes[0]!.problems['fees']).toBeUndefined();
  });

  it('asks for a price instead of showing a total when the fuel price is zero or blank', () => {
    for (const price of ['', '0', '0.000']) {
      const e = evaluate(withQuote({}, { fuelPrice: price }), R);
      expect(e.ranked, price).toEqual([]);
      expect(e.trip.problems['fuelPrice'], price).toBeDefined();
    }
  });

  it('asks for the distance on a route that has no official figure', () => {
    const e = evaluate(withQuote({}, { routeId: 'canmore' }), R);
    expect(e.ranked).toEqual([]);
    expect(e.trip.problems['oneWay']?.blank).toBe(true);
    const typed = evaluate(withQuote({}, { routeId: 'canmore', oneWay: '105' }), R);
    expect(typed.trip.km).toBe(210);
    expect(typed.ranked).toHaveLength(1);
  });

  it('treats an unknown route id from a link as a typed route', () => {
    const e = evaluate(withQuote({}, { routeId: 'nowhere' }), R);
    expect(e.trip.problems['oneWay']?.blank).toBe(true);
  });

  it('adds extra driving to the round trip', () => {
    const e = evaluate(withQuote({}, { extraKm: '40' }), R);
    expect(e.trip.km).toBe(300);
  });
});

describe('hostile input', () => {
  const bad = ['NaN', 'Infinity', '-Infinity', '1e9', '-50', '0', '1,2,3', 'abc', '$', '999999999999999999999', '１２３'];

  it('never lets NaN, Infinity or undefined reach a total, for any box', () => {
    for (const junk of bad) {
      const boxes: Partial<FormState['quotes'][number]>[] = [{ rate: junk }, { days: junk }, { fees: junk }, { l100: junk }, { extras: [{ label: 'x', amount: junk }] }];
      for (const b of boxes) {
        const e = evaluate(withQuote(b), R);
        for (const q of e.ranked) {
          const all = [q.totalCents, q.perDayCents, q.litres, ...Object.values(q.lines)];
          expect(all.every((n) => Number.isFinite(n) && !Object.is(n, -0)), `${junk} ${JSON.stringify(b)}`).toBe(true);
        }
      }
      const trips: Partial<FormState>[] = [{ fuelPrice: junk }, { oneWay: junk, routeId: '' }, { extraKm: junk }, { adults: junk }, { parkDays: junk }, { typedPass: junk, passMode: 'typed' }];
      for (const t of trips) {
        const e = evaluate(withQuote({}, t), R);
        for (const q of e.ranked) expect(text(q.totalCents)).not.toMatch(/NaN|Infinity|undefined|-0$/);
      }
    }
  });

  it('refuses days of 0, -3, 0.5 and 1e9', () => {
    for (const d of ['0', '-3', '0.5', '1e9', '1000000000']) {
      const e = evaluate(withQuote({ days: d }), R);
      expect(e.ranked, d).toEqual([]);
      expect(e.quotes[0]!.problems['days']?.blank, d).toBe(false);
    }
  });

  it('reads $1,234.56 and 1.234,56 as the same daily rate', () => {
    const a = evaluate(withQuote({ rate: '$1,234.56' }), R).ranked[0]!;
    const b = evaluate(withQuote({ rate: '1.234,56' }), R).ranked[0]!;
    expect(a.lines.rental).toBe(123456 * 4);
    expect(b.lines.rental).toBe(a.lines.rental);
  });

  it('accepts a negative fee as a discount but not a negative daily rate', () => {
    expect(evaluate(withQuote({ fees: '-50' }), R).ranked[0]!.lines.fees).toBe(-5000);
    expect(evaluate(withQuote({ rate: '-50' }), R).ranked).toEqual([]);
  });

  it('flags a total that falls below zero', () => {
    const e = evaluate(withQuote({ rate: '1', days: '1', fees: '-900000' }), R);
    expect(e.ranked).toEqual([]);
    expect(e.quotes[0]!.problems['total']?.message).toMatch(/less than zero/);
  });

  it('ignores an extra with no amount and flags one with a bad amount', () => {
    const ok = evaluate(withQuote({ extras: [{ label: 'Chains', amount: '' }] }), R);
    expect(ok.ranked).toHaveLength(1);
    const bad = evaluate(withQuote({ extras: [{ label: 'Chains', amount: 'lots' }] }), R);
    expect(bad.ranked).toEqual([]);
    expect(bad.quotes[0]!.problems['extra0']).toBeDefined();
  });

  it('prices a huge but valid quote without losing a cent', () => {
    const e = evaluate(withQuote({ rate: '999999.99', days: '365', fees: '999999.99', l100: '60' }, { extraKm: '49000', fuelPrice: '9.999' }), R);
    const q = e.ranked[0]!;
    expect(q.lines.rental).toBe(99_999_999 * 365);
    expect(Number.isSafeInteger(q.totalCents)).toBe(true);
  });
});

describe('the park pass line', () => {
  it('needs at least one traveller for a daily or Discovery pass, but not when set to none', () => {
    const none = evaluate(withQuote({}, { adults: '', passMode: 'none' }), R);
    expect(none.ranked).toHaveLength(1);
    const daily = evaluate(withQuote({}, { adults: '', passMode: 'daily' }), R);
    expect(daily.ranked).toEqual([]);
    expect(daily.trip.problems['adults']?.message).toMatch(/at least one traveller/);
  });

  it('asks for the park days instead of pricing a blank box at zero', () => {
    for (const mode of ['auto', 'daily'] as const) {
      const e = evaluate(withQuote({}, { parkDays: '', passMode: mode }), R);
      expect(e.ranked, mode).toEqual([]);
      expect(e.trip.problems['parkDays']?.blank, mode).toBe(true);
    }
    // an explicit 0 is an answer; the Discovery Pass, "none" and a typed amount do not need the days
    expect(evaluate(withQuote({}, { parkDays: '0', passMode: 'auto' }), R).ranked).toHaveLength(1);
    for (const mode of ['discovery', 'none'] as const) expect(evaluate(withQuote({}, { parkDays: '', passMode: mode }), R).ranked, mode).toHaveLength(1);
    expect(evaluate(withQuote({}, { parkDays: '', passMode: 'typed', typedPass: '10' }), R).ranked).toHaveLength(1);
  });

  it('asks for the Kananaskis days instead of leaving the Conservation Pass out', () => {
    const e = evaluate(withQuote({}, { routeId: 'kananaskis', oneWay: '90', kDays: '' }), R);
    expect(e.ranked).toEqual([]);
    expect(e.trip.problems['kDays']?.blank).toBe(true);
    expect(evaluate(withQuote({}, { routeId: 'kananaskis', oneWay: '90', kDays: '0' }), R).ranked).toHaveLength(1);
  });

  it('uses a typed pass amount', () => {
    const e = evaluate(withQuote({}, { passMode: 'typed', typedPass: '75.50' }), R);
    expect(e.trip.pass?.cents).toBe(7550);
  });

  it('adds the Kananaskis Conservation Pass per vehicle-day on that route only', () => {
    const k = evaluate(withQuote({}, { routeId: 'kananaskis', oneWay: '90', kDays: '3' }), R);
    expect(k.trip.shared?.kpassCents).toBe(4500);
    const banff = evaluate(withQuote({}, { routeId: 'banff', kDays: '3' }), R);
    expect(banff.trip.shared?.kpassCents).toBe(0);
  });

  it('tells a Banff daily pass from 7 versus 8 people', () => {
    const seven = evaluate(withQuote({}, { adults: '7', parkDays: '1', passMode: 'daily' }), R);
    const eight = evaluate(withQuote({}, { adults: '8', parkDays: '1', passMode: 'daily' }), R);
    expect(seven.trip.pass?.cents).toBe(2450);
    expect(eight.trip.pass?.cents).toBe(9800);
  });
});

describe('quotes among many', () => {
  it('ranks only the quotes that can be priced and leaves the unfinished ones out', () => {
    const s = sampleState();
    s.quotes.push({ label: 'Half done', rate: '40', days: '', fees: '', l100: '8', vehicle: '', extras: [] });
    const e = evaluate(s, R);
    expect(e.quotes).toHaveLength(3);
    expect(e.quotes[2]!.cost).toBeNull();
    expect(e.ranked).toHaveLength(2);
  });

  it('says no difference for two identical quotes', () => {
    const s = sampleState();
    s.quotes = [s.quotes[0]!, { ...s.quotes[0]!, label: 'Copy' }];
    const e = evaluate(s, R);
    expect(e.ranked.map((q) => q.rank)).toEqual([1, 1]);
  });
});
