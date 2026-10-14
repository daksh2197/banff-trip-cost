/**
 * Turns one Fuel Consumption Ratings CSV into vehicles.
 *
 * What it trusts: the column names (matched without case, spaces or punctuation, so "City (L/100 km)" and
 * "city l/100km" are the same column) and nothing else. Every row is checked on its own. A bad row is counted
 * and left out with its reason; a missing column or a page that is not a CSV stops the whole file.
 */

import { FUEL_CODES, MAX_RATING, MIN_RATING, type FuelCode, type Vehicle } from '../src/core/vehicles';
import { parseCsv } from './csv';

export interface RejectedRow {
  /** Line number in the file, counting the header as line 1. */
  line: number;
  reason: string;
}

export interface ParsedRatings {
  vehicles: Vehicle[];
  rejected: RejectedRow[];
  duplicates: number;
  /** Data rows read, good or bad. */
  rows: number;
}

export class RatingsFileError extends Error {}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Column names after norm(). The three optional ones are nice to have. */
const COLUMNS = {
  year: 'modelyear',
  make: 'make',
  model: 'model',
  cls: 'vehicleclass',
  engineL: 'enginesizel',
  cyl: 'cylinders',
  trans: 'transmission',
  fuel: 'fueltype',
  city: 'cityl100km',
  hwy: 'highwayl100km',
  comb: 'combinedl100km',
} as const;

const REQUIRED: (keyof typeof COLUMNS)[] = ['year', 'make', 'model', 'cls', 'fuel', 'city', 'hwy', 'comb'];

/** "8.5" or "8,5" to 8.5. Anything else (blank, "-", "n/a", "1,234.5") is null. */
export function readDecimal(text: string | undefined): number | null {
  const t = (text ?? '').trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parseRatings(csv: string, years: { min: number; max: number }): ParsedRatings {
  if (/^\s*<(?:!doctype|html|\?xml|head|body)/i.test(csv.replace(/^﻿/, ''))) {
    throw new RatingsFileError('The download is a web page, not a CSV.');
  }
  let table: string[][];
  try {
    table = parseCsv(csv);
  } catch (e) {
    throw new RatingsFileError(e instanceof Error ? e.message : 'The file could not be read as CSV.');
  }
  const header = table[0];
  if (!header || table.length < 2) throw new RatingsFileError('The file has no data rows.');

  const index = new Map<string, number>();
  header.forEach((h, i) => {
    if (!index.has(norm(h))) index.set(norm(h), i);
  });
  const missing = REQUIRED.filter((k) => !index.has(COLUMNS[k]));
  if (missing.length > 0) {
    throw new RatingsFileError(`Missing columns: ${missing.map((k) => COLUMNS[k]).join(', ')}. Found: ${header.join(' | ')}`);
  }
  const at = (row: string[], key: keyof typeof COLUMNS): string => {
    const i = index.get(COLUMNS[key]);
    return i === undefined ? '' : (row[i] ?? '').trim();
  };

  const vehicles: Vehicle[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let rows = 0;

  table.slice(1).forEach((row, n) => {
    const line = n + 2;
    if (row.every((c) => c.trim() === '')) return;
    rows++;
    const reject = (reason: string) => rejected.push({ line, reason });

    const year = Number(at(row, 'year'));
    if (!Number.isInteger(year) || year < years.min || year > years.max) return reject(`model year "${at(row, 'year')}" is outside ${years.min} to ${years.max}`);
    const make = at(row, 'make');
    const model = at(row, 'model');
    if (make === '' || model === '') return reject('make or model is blank');
    const fuel = at(row, 'fuel').toUpperCase();
    if (!FUEL_CODES.includes(fuel as FuelCode)) return reject(`fuel type "${at(row, 'fuel')}" is not one of X, Z, D, E`);

    const city = readDecimal(at(row, 'city'));
    const hwy = readDecimal(at(row, 'hwy'));
    const comb = readDecimal(at(row, 'comb'));
    if (city === null || hwy === null || comb === null) return reject('a rating is blank or not a number');
    for (const r of [city, hwy, comb]) {
      if (r < MIN_RATING || r > MAX_RATING) return reject(`rating ${r} L/100 km is outside ${MIN_RATING} to ${MAX_RATING}`);
    }

    const engine = readDecimal(at(row, 'engineL'));
    const cylText = at(row, 'cyl');
    const cyl = /^\d+$/.test(cylText) ? Number(cylText) : null;
    const v: Vehicle = { year, make, model, cls: at(row, 'cls'), engineL: engine, cyl, trans: at(row, 'trans'), fuel: fuel as FuelCode, city, hwy, comb };

    const key = JSON.stringify(v);
    if (seen.has(key)) {
      duplicates++;
      return;
    }
    seen.add(key);
    vehicles.push(v);
  });

  return { vehicles, rejected, duplicates, rows };
}
