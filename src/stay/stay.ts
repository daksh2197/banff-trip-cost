/**
 * Where to stay: a hotel against a short-term rental (Airbnb, VRBO and the like), priced over the same nights.
 *
 * The nightly rate is the headline. The fees, the taxes at checkout, parking, eating out when there is no
 * kitchen, and the extra driving from a cheaper town all move the total. Every amount here is typed by the
 * person from the offer they are looking at. Nothing is fetched and nothing has a default price.
 * Money is whole cents from the moment it is read.
 */

import { fuelCostCents } from '../core/fuel';
import { dollars } from '../core/format';
import { parseCount, parseDays, parseExtraKm, parseL100, parseMoney, parsePricePerLitre, type Parsed } from '../core/parse';

export type StayKind = 'hotel' | 'rental';

export interface StayForm {
  label: string;
  kind: StayKind;
  rate: string;
  nights: string;
  fees: string;
  taxes: string;
  parking: string;
  food: string;
  km: string;
}

export interface StayTrip {
  people: string;
  l100: string;
  fuel: string;
  stays: StayForm[];
}

export const MAX_STAYS = 6;

export const STAY_FIELDS: { key: keyof Omit<StayForm, 'label' | 'kind'>; label: string; hint?: string; required?: boolean }[] = [
  { key: 'rate', label: 'Nightly rate ($)', required: true },
  { key: 'nights', label: 'Nights', required: true },
  { key: 'fees', label: 'Cleaning, service and resort fees, total ($)', hint: 'As the checkout page shows them.' },
  { key: 'taxes', label: 'Taxes at checkout, total ($)', hint: 'Copy the total from the checkout page. The page does not work out taxes.' },
  { key: 'parking', label: 'Parking a night ($)' },
  { key: 'food', label: 'Food a day for the group ($)', hint: 'Cooking in a kitchen usually costs less than eating out. Type your own guess for this place.' },
  { key: 'km', label: 'Extra driving a day from here (km)', hint: 'For a cheaper place further from where you will spend the days. Blank means none.' },
];

export type StayLine = 'room' | 'fees' | 'taxes' | 'parking' | 'food' | 'driving';
export const STAY_LINE_LABELS: Record<StayLine, string> = {
  room: 'Nightly rate times nights',
  fees: 'Fees',
  taxes: 'Taxes',
  parking: 'Parking',
  food: 'Food',
  driving: 'Extra driving (fuel)',
};
export const STAY_LINES = Object.keys(STAY_LINE_LABELS) as StayLine[];

export interface PricedStay {
  ok: true;
  index: number;
  label: string;
  lines: Record<StayLine, number>;
  total: number;
  perNight: number;
  /** Per person per night, or null when no people count is typed. */
  perPersonNight: number | null;
}

export interface UnpricedStay {
  ok: false;
  index: number;
  label: string;
  errors: Partial<Record<keyof StayForm, string>>;
}

export interface StayResult {
  shared: { errors: Partial<Record<'people' | 'l100' | 'fuel', string>> };
  stays: (PricedStay | UnpricedStay)[];
  /** Priced stays, cheapest total first. Ties keep the order typed. */
  ranked: PricedStay[];
}

const opt = (text: string, read: (t: string) => Parsed): Parsed => (text.trim() === '' ? { ok: true, value: 0 } : read(text));

export function stayLabel(s: StayForm, i: number): string {
  const t = s.label.trim();
  return t === '' ? `Stay ${i + 1}` : t;
}

export function evaluateStays(trip: StayTrip): StayResult {
  const sharedErrors: StayResult['shared']['errors'] = {};
  const people = parseCount(trip.people, 'the number of people');
  if (!people.ok) sharedErrors.people = people.message;
  const anyKm = trip.stays.some((s) => s.km.trim() !== '' && s.km.trim() !== '0');
  const l100 = trip.l100.trim() === '' ? null : parseL100(trip.l100);
  const fuel = trip.fuel.trim() === '' ? null : parsePricePerLitre(trip.fuel);
  if (l100 && !l100.ok) sharedErrors.l100 = l100.message;
  if (fuel && !fuel.ok) sharedErrors.fuel = fuel.message;
  if (anyKm && !l100) sharedErrors.l100 = 'Enter the fuel use to price the extra driving.';
  if (anyKm && !fuel) sharedErrors.fuel = 'Enter the fuel price to price the extra driving.';
  const driveOk = !sharedErrors.l100 && !sharedErrors.fuel;

  const stays = trip.stays.map((s, index): PricedStay | UnpricedStay => {
    const label = stayLabel(s, index);
    const errors: UnpricedStay['errors'] = {};
    const read = (key: keyof StayForm, r: Parsed): number => {
      if (r.ok) return r.value;
      errors[key] = r.message;
      return 0;
    };
    const rate = read('rate', parseMoney(s.rate, 'the nightly rate'));
    const nights = read('nights', parseDays(s.nights, 'the nights'));
    const fees = read('fees', opt(s.fees, (t) => parseMoney(t, 'the fees')));
    const taxes = read('taxes', opt(s.taxes, (t) => parseMoney(t, 'the taxes')));
    const parking = read('parking', opt(s.parking, (t) => parseMoney(t, 'the parking')));
    const food = read('food', opt(s.food, (t) => parseMoney(t, 'the food')));
    const km = read('km', parseExtraKm(s.km));
    if (Object.keys(errors).length > 0) return { ok: false, index, label, errors };
    if (km > 0 && !driveOk) return { ok: false, index, label, errors: { km: 'Fill in the fuel use and price above to price this.' } };

    const lines: Record<StayLine, number> = {
      room: rate * nights,
      fees,
      taxes,
      parking: parking * nights,
      food: food * nights,
      driving: km > 0 && l100?.ok && fuel?.ok ? fuelCostCents(km * nights, l100.value, fuel.value) : 0,
    };
    const total = STAY_LINES.reduce((sum, k) => sum + lines[k], 0);
    const perNight = Math.round(total / nights);
    const perPersonNight = people.ok && people.value > 0 ? Math.round(total / nights / people.value) : null;
    return { ok: true, index, label, lines, total, perNight, perPersonNight };
  });

  const ranked = stays.filter((s): s is PricedStay => s.ok).sort((a, b) => a.total - b.total || a.index - b.index);
  return { shared: { errors: sharedErrors }, stays, ranked };
}

/** One sentence on the gap between the cheapest and the next stay, naming the line that moved most. */
export function staySentence(a: PricedStay, b: PricedStay): string {
  let biggest: StayLine = 'room';
  let gap = 0;
  for (const k of STAY_LINES) {
    const d = b.lines[k] - a.lines[k];
    if (Math.abs(d) > Math.abs(gap)) {
      gap = d;
      biggest = k;
    }
  }
  const diff = b.total - a.total;
  if (diff === 0) return `${a.label} and ${b.label} cost the same over the stay.`;
  const more = gap > 0 ? b.label : a.label;
  return `${a.label} costs ${dollars(diff)} less than ${b.label} over the stay. The biggest gap is ${STAY_LINE_LABELS[biggest].toLowerCase()}: ${dollars(Math.abs(gap))} more for ${more}.`;
}

export function blankStay(n: number, kind: StayKind): StayForm {
  return { label: `Stay ${n}`, kind, rate: '', nights: '', fees: '', taxes: '', parking: '', food: '', km: '' };
}

/** Invented numbers so the page is not empty. Not prices from anywhere; the page says so. */
export function sampleStayTrip(): StayTrip {
  return {
    people: '4',
    l100: '9',
    fuel: '1.60',
    stays: [
      { label: 'Sample: hotel in Banff', kind: 'hotel', rate: '260', nights: '3', fees: '', taxes: '110', parking: '25', food: '200', km: '' },
      { label: 'Sample: rental in Canmore', kind: 'rental', rate: '210', nights: '3', fees: '180', taxes: '95', parking: '', food: '110', km: '50' },
    ],
  };
}
