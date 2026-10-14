/**
 * The gate. A fetched file is only allowed to replace the old data if it passes every check here.
 * Failing is the safe outcome: the job stops with an error and the data already in the repo stays.
 */

import type { Vehicle } from '../src/core/vehicles';
import type { ParsedRatings } from './ratings';

export interface Limits {
  /** Fewest good rows a real year's file can have. */
  minRows: number;
  /** Most rows that may be left out as bad before the whole file is distrusted, as a share of rows read. */
  maxRejectedShare: number;
  /** The new data may not be smaller than this share of the old data. */
  minShareOfPrevious: number;
}

export const LIMITS: Limits = { minRows: 200, maxRejectedShare: 0.05, minShareOfPrevious: 0.7 };

export function validate(parsed: ParsedRatings, expectYear: number, previous: Vehicle[] | null, limits: Limits = LIMITS): string[] {
  const errors: string[] = [];
  const good = parsed.vehicles.length;

  if (good < limits.minRows) errors.push(`Only ${good} usable rows; a real file has at least ${limits.minRows}.`);
  const share = parsed.rows === 0 ? 1 : parsed.rejected.length / parsed.rows;
  if (share > limits.maxRejectedShare) {
    const first = parsed.rejected[0];
    errors.push(
      `${parsed.rejected.length} of ${parsed.rows} rows were bad (${(share * 100).toFixed(1)}%, limit ${limits.maxRejectedShare * 100}%). First: line ${first?.line}, ${first?.reason}.`,
    );
  }
  if (good > 0 && !parsed.vehicles.some((v) => v.year === expectYear)) errors.push(`No rows for model year ${expectYear}.`);

  if (previous && previous.length > 0) {
    const prevThisYear = previous.filter((v) => v.year === expectYear).length;
    if (prevThisYear > 0 && good < prevThisYear * limits.minShareOfPrevious) {
      errors.push(`The file shrank from ${prevThisYear} to ${good} rows for ${expectYear}, under ${limits.minShareOfPrevious * 100}% of before.`);
    }
  }
  return errors;
}
