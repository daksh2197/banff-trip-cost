/**
 * Vehicles from Natural Resources Canada's Fuel Consumption Ratings, as the monthly job saves them.
 * The same type and checks are used by the job (pipeline/) and by the page, so a file the page
 * would choke on can never be committed.
 */

import type { RatingBasis } from './state';

/** Fuel codes the ratings use for engines that burn liquid fuel. X regular, Z premium, D diesel, E ethanol (E85). */
export type FuelCode = 'X' | 'Z' | 'D' | 'E';
export const FUEL_CODES: FuelCode[] = ['X', 'Z', 'D', 'E'];

export const FUEL_NAMES: Record<FuelCode, string> = {
  X: 'regular gasoline',
  Z: 'premium gasoline',
  D: 'diesel',
  E: 'E85 ethanol',
};

export interface Vehicle {
  year: number;
  make: string;
  model: string;
  cls: string;
  engineL: number | null;
  cyl: number | null;
  trans: string;
  fuel: FuelCode;
  /** Litres per 100 km, as published (one decimal). */
  city: number;
  hwy: number;
  comb: number;
}

/** A rating the page or the job will accept. Real ratings sit between about 3 and 25. */
export const MIN_RATING = 1;
export const MAX_RATING = 30;

export function isRating(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= MIN_RATING && n <= MAX_RATING;
}

/** Checks one entry from a vehicles.json file. Anything else is dropped by the page. */
export function isVehicle(v: unknown): v is Vehicle {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['year'] === 'number' &&
    Number.isInteger(o['year']) &&
    o['year'] >= 1990 &&
    o['year'] <= 2100 &&
    typeof o['make'] === 'string' &&
    o['make'] !== '' &&
    typeof o['model'] === 'string' &&
    o['model'] !== '' &&
    typeof o['cls'] === 'string' &&
    typeof o['trans'] === 'string' &&
    (o['engineL'] === null || typeof o['engineL'] === 'number') &&
    (o['cyl'] === null || typeof o['cyl'] === 'number') &&
    FUEL_CODES.includes(o['fuel'] as FuelCode) &&
    isRating(o['city']) &&
    isRating(o['hwy']) &&
    isRating(o['comb'])
  );
}

/** One id per distinct listing, short enough to live in a share link. */
export function vehicleKey(v: Vehicle): string {
  return [v.year, v.make, v.model, v.engineL ?? '', v.cyl ?? '', v.trans, v.fuel].join('|');
}

export function ratingOf(v: Vehicle, basis: RatingBasis): number {
  return basis === 'hwy' ? v.hwy : basis === 'city' ? v.city : v.comb;
}

/** 8.5 -> 850. Ratings have one decimal, so this is exact. */
export function toHundredths(rating: number): number {
  return Math.round(rating * 100);
}

export function vehicleLabel(v: Vehicle): string {
  const engine = v.engineL !== null ? `${v.engineL.toFixed(1)} L` : '';
  const cyl = v.cyl !== null ? `${v.cyl} cyl` : '';
  return [`${v.year} ${v.make} ${v.model}`, v.cls, [engine, cyl].filter(Boolean).join(' '), v.trans].filter(Boolean).join(' · ');
}

/** Makes and models containing every word typed, case-blind. At most `limit` come back. */
export function searchVehicles(list: Vehicle[], query: string, cls: string, limit = 60): Vehicle[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: Vehicle[] = [];
  for (const v of list) {
    if (cls !== '' && v.cls !== cls) continue;
    const hay = `${v.year} ${v.make} ${v.model}`.toLowerCase();
    if (words.every((w) => hay.includes(w))) {
      out.push(v);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function classesOf(list: Vehicle[]): string[] {
  return [...new Set(list.map((v) => v.cls))].sort((a, b) => a.localeCompare(b));
}

/** The mean rating of every listing in a class, to the hundredth. Null when the class is empty. */
export function classAverage(list: Vehicle[], cls: string, basis: RatingBasis): { hundredths: number; count: number } | null {
  const inClass = list.filter((v) => v.cls === cls);
  if (inClass.length === 0) return null;
  const sum = inClass.reduce((s, v) => s + toHundredths(ratingOf(v, basis)), 0);
  return { hundredths: Math.round(sum / inClass.length), count: inClass.length };
}
