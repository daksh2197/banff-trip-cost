/**
 * The trip total for one rental quote, and the ranking of several.
 *
 * A quote is what the user pasted from a rental offer, plus the winter extras they add.
 * The trip is what every quote shares: the distance, the fuel price, the park pass.
 * Total = rental (daily rate x days) + fees and taxes as quoted + fuel + park pass + Kananaskis pass + winter extras.
 */

import { fuelCostCents, litresUsed } from './fuel';

export interface Extra {
  label: string;
  cents: number;
}

export interface Quote {
  /** Stable position in the list, used to keep ties in the order they were entered. */
  id: string;
  label: string;
  dailyRateCents: number;
  days: number;
  feesCents: number;
  l100Hundredths: number;
  extras: Extra[];
}

export interface TripShared {
  km: number;
  priceMills: number;
  passCents: number;
  kpassCents: number;
}

export interface Lines {
  rental: number;
  fees: number;
  fuel: number;
  pass: number;
  kpass: number;
  extras: number;
}

export interface QuoteCost {
  id: string;
  label: string;
  days: number;
  lines: Lines;
  /** The winter extras that were added up, in the order typed. */
  extras: Extra[];
  litres: number;
  totalCents: number;
  perDayCents: number;
}

/** Cost of one quote over the shared trip. Whole cents. */
export function costQuote(q: Quote, t: TripShared): QuoteCost {
  const rental = q.dailyRateCents * q.days;
  const fuel = fuelCostCents(t.km, q.l100Hundredths, t.priceMills);
  const extras = q.extras.reduce((sum, e) => sum + e.cents, 0);
  const lines: Lines = { rental, fees: q.feesCents, fuel, pass: t.passCents, kpass: t.kpassCents, extras };
  const total = rental + q.feesCents + fuel + t.passCents + t.kpassCents + extras;
  // Per day, rounded half up to the cent. Days is at least 1 by the time a quote gets here.
  const perDay = Math.floor((2 * total + q.days) / (2 * q.days));
  return {
    id: q.id,
    label: q.label,
    days: q.days,
    lines,
    extras: q.extras,
    litres: litresUsed(t.km, q.l100Hundredths),
    totalCents: total,
    perDayCents: perDay,
  };
}

export interface Ranked extends QuoteCost {
  /** 1 is cheapest. Equal totals share a rank, so two ties for first are both 1 and the next is 3. */
  rank: number;
}

/** Cheapest total first. Ties keep the order the quotes were entered in. */
export function rankQuotes(costs: QuoteCost[]): Ranked[] {
  const order = costs.map((c, i) => ({ c, i })).sort((a, b) => a.c.totalCents - b.c.totalCents || a.i - b.i);
  const out: Ranked[] = [];
  order.forEach(({ c }, position) => {
    const prev = out[position - 1];
    out.push({ ...c, rank: prev && prev.totalCents === c.totalCents ? prev.rank : position + 1 });
  });
  return out;
}

/** The one-way kilometres of a route become the round trip, plus any extra driving. */
export function tripKm(oneWayKm: number, extraKm: number): number {
  return oneWayKm * 2 + extraKm;
}
