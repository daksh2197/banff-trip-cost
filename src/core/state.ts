/**
 * What the form holds. Every value is the text the person typed, so a shared link can bring back
 * exactly what was on screen, including a box that was still wrong.
 */

import type { PassMode } from './pass';

export interface ExtraForm {
  label: string;
  amount: string;
}

export interface QuoteForm {
  label: string;
  rate: string;
  days: string;
  fees: string;
  l100: string;
  /** Key of the vehicle picked from the data file, or '' if the fuel use was typed. */
  vehicle: string;
  extras: ExtraForm[];
}

export type RatingBasis = 'comb' | 'hwy' | 'city';

export interface FormState {
  routeId: string;
  /** One-way km, typed, for routes that have no official figure. */
  oneWay: string;
  extraKm: string;
  fuelPrice: string;
  adults: string;
  seniors: string;
  youths: string;
  parkDays: string;
  passMode: PassMode;
  typedPass: string;
  kDays: string;
  basis: RatingBasis;
  quotes: QuoteForm[];
  cmpA: number;
  cmpB: number;
  /** True while the numbers on screen are the invented sample. */
  sample: boolean;
}

export const MAX_QUOTES = 10;
export const MAX_EXTRAS = 6;

export function blankQuote(n: number): QuoteForm {
  return { label: `Quote ${n}`, rate: '', days: '', fees: '', l100: '', vehicle: '', extras: [] };
}

export function emptyState(): FormState {
  return {
    routeId: 'banff',
    oneWay: '',
    extraKm: '',
    fuelPrice: '',
    adults: '2',
    seniors: '',
    youths: '',
    parkDays: '',
    passMode: 'auto',
    typedPass: '',
    kDays: '',
    basis: 'comb',
    quotes: [blankQuote(1)],
    cmpA: 0,
    cmpB: 1,
    sample: false,
  };
}

/**
 * Invented numbers so the page shows something on a first visit. They are not quotes, prices or ratings
 * from anywhere. The page says so next to them, and "Clear all" removes them.
 */
export function sampleState(): FormState {
  return {
    ...emptyState(),
    fuelPrice: '1.70',
    adults: '2',
    parkDays: '2',
    quotes: [
      { label: 'Sample A: small car', rate: '55', days: '4', fees: '95', l100: '7.5', vehicle: '', extras: [] },
      {
        label: 'Sample B: SUV with winter tires',
        rate: '72',
        days: '4',
        fees: '130',
        l100: '10.5',
        vehicle: '',
        extras: [{ label: 'Winter tires', amount: '60' }],
      },
    ],
    cmpA: 0,
    cmpB: 1,
    sample: true,
  };
}
