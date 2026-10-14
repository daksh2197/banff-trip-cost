/**
 * Turns what is typed into numbers, or into a plain-words reason why it cannot yet.
 * This is the single place the form meets the maths. It never throws and never yields NaN.
 */

import { passCost, type PassCost, type PassTable } from './pass';
import {
  parseCount,
  parseDays,
  parseExtraKm,
  parseKm,
  parseL100,
  parseMoney,
  parsePassDays,
  parsePricePerLitre,
  type Parsed,
} from './parse';
import type { FormState } from './state';
import { costQuote, rankQuotes, tripKm, type Extra, type Quote, type QuoteCost, type Ranked, type TripShared } from './trip';

export interface RouteRef {
  id: string;
  label: string;
  oneWayKm: number | null;
  kpass?: boolean;
}

export interface Reference {
  passes: PassTable;
  kpass: { dayCents: number };
  routes: RouteRef[];
}

/** A problem with one box. `blank` problems are "not filled in yet", shown in the results, not in red on the box. */
export interface Problem {
  blank: boolean;
  message: string;
}

export type Problems = Record<string, Problem>;

export interface TripResult {
  /** Present only when every shared box is good. */
  shared: TripShared | null;
  km: number | null;
  pass: PassCost | null;
  problems: Problems;
}

export interface QuoteResult {
  index: number;
  cost: QuoteCost | null;
  problems: Problems;
}

export interface Evaluation {
  trip: TripResult;
  quotes: QuoteResult[];
  /** Quotes that could be priced, cheapest first. */
  ranked: Ranked[];
}

function take(problems: Problems, key: string, r: Parsed, blankOk = false): number | null {
  if (r.ok) return r.value;
  if (r.reason === 'blank' && blankOk) return 0;
  problems[key] = { blank: r.reason === 'blank', message: r.message };
  return null;
}

export function evaluateTrip(s: FormState, ref: Reference): TripResult {
  const problems: Problems = {};
  const route = ref.routes.find((r) => r.id === s.routeId);

  // Distance: an official figure, or the one-way number the person typed.
  let oneWay: number | null = null;
  if (route && route.oneWayKm !== null) oneWay = route.oneWayKm;
  else oneWay = take(problems, 'oneWay', parseKm(s.oneWay, 'the one-way distance'));
  const extra = take(problems, 'extraKm', parseExtraKm(s.extraKm));
  const km = oneWay !== null && extra !== null ? tripKm(oneWay, extra) : null;

  const priceMills = take(problems, 'fuelPrice', parsePricePerLitre(s.fuelPrice));

  const adults = take(problems, 'adults', parseCount(s.adults, 'the number of adults'));
  const seniors = take(problems, 'seniors', parseCount(s.seniors, 'the number of seniors'));
  const youths = take(problems, 'youths', parseCount(s.youths, 'the number of youths'));
  const parkDays = take(problems, 'parkDays', parsePassDays(s.parkDays));
  const typed = s.passMode === 'typed' ? take(problems, 'typedPass', parseMoney(s.typedPass, 'the pass amount')) : 0;

  let pass: PassCost | null = null;
  if (adults !== null && seniors !== null && youths !== null && parkDays !== null && typed !== null) {
    const needsParty = s.passMode === 'auto' || s.passMode === 'daily' || s.passMode === 'discovery';
    if (needsParty && adults + seniors + youths === 0) {
      problems['adults'] = { blank: true, message: 'Enter at least one traveller.' };
    } else {
      pass = passCost(s.passMode, { adults, seniors, youths }, parkDays, ref.passes, typed);
    }
  }

  let kpassCents: number | null = 0;
  if (route?.kpass) {
    const days = take(problems, 'kDays', parsePassDays(s.kDays));
    kpassCents = days === null ? null : days * ref.kpass.dayCents;
  }

  const shared: TripShared | null =
    km !== null && priceMills !== null && pass !== null && kpassCents !== null
      ? { km, priceMills, passCents: pass.cents, kpassCents }
      : null;
  return { shared, km, pass, problems };
}

export function evaluateQuote(s: FormState, index: number, shared: TripShared | null): QuoteResult {
  const f = s.quotes[index];
  const problems: Problems = {};
  if (!f) return { index, cost: null, problems };

  const rate = take(problems, 'rate', parseMoney(f.rate, 'the daily rate'));
  const days = take(problems, 'days', parseDays(f.days, 'the rental days'));
  const fees = take(problems, 'fees', parseMoney(f.fees, 'the fees and taxes', true), true);
  const l100 = take(problems, 'l100', parseL100(f.l100));

  const extras: Extra[] = [];
  f.extras.forEach((e, i) => {
    if (e.amount.trim() === '') return;
    const cents = take(problems, `extra${i}`, parseMoney(e.amount, 'the extra', true));
    if (cents !== null) extras.push({ label: e.label.trim(), cents });
  });

  if (rate === null || days === null || fees === null || l100 === null || Object.keys(problems).length > 0 || !shared) {
    return { index, cost: null, problems };
  }
  const quote: Quote = { id: String(index), label: f.label.trim(), dailyRateCents: rate, days, feesCents: fees, l100Hundredths: l100, extras };
  const cost = costQuote(quote, shared);
  if (cost.totalCents < 0) {
    problems['total'] = { blank: false, message: 'The total comes to less than zero. Check the discounts.' };
    return { index, cost: null, problems };
  }
  return { index, cost, problems };
}

export function evaluate(s: FormState, ref: Reference): Evaluation {
  const trip = evaluateTrip(s, ref);
  const quotes = s.quotes.map((_, i) => evaluateQuote(s, i, trip.shared));
  const ranked = rankQuotes(quotes.flatMap((q) => (q.cost ? [q.cost] : [])));
  return { trip, quotes, ranked };
}
