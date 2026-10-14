/**
 * Two quotes side by side, and one sentence on what makes the difference.
 * The park pass is the same for both, so it never explains a gap and is left out of the comparison.
 */

import { dollars } from './format';
import type { Lines, QuoteCost } from './trip';

export type LineKey = 'rental' | 'fees' | 'fuel' | 'extras';

const LINE_NAMES: Record<LineKey, string> = {
  rental: 'the rental itself (daily rate times days)',
  fees: 'the fees and taxes',
  fuel: 'fuel',
  extras: 'the winter extras',
};

const KEYS: LineKey[] = ['rental', 'fees', 'fuel', 'extras'];

export interface Comparison {
  /** Positive when B costs more than A. */
  totalDelta: number;
  deltas: Record<LineKey, number>;
  sentence: string;
}

function name(q: QuoteCost, fallback: string): string {
  const label = q.label.trim();
  return label === '' ? fallback : label;
}

export function compareQuotes(a: QuoteCost, b: QuoteCost): Comparison {
  const deltas = {} as Record<LineKey, number>;
  for (const k of KEYS) deltas[k] = (b.lines as Lines)[k] - (a.lines as Lines)[k];
  const totalDelta = b.totalCents - a.totalCents;
  const nameA = name(a, 'Quote A');
  const nameB = name(b, 'Quote B');

  if (totalDelta === 0) {
    const same = KEYS.every((k) => deltas[k] === 0);
    return {
      totalDelta,
      deltas,
      sentence: same
        ? `No difference: both come to ${dollars(a.totalCents)} for the trip.`
        : `Same total of ${dollars(a.totalCents)}, but the lines are split differently.`,
    };
  }

  const cheaper = totalDelta > 0 ? a : b;
  const dearer = totalDelta > 0 ? b : a;
  const cheaperName = totalDelta > 0 ? nameA : nameB;
  const dearerName = totalDelta > 0 ? nameB : nameA;
  const gap = Math.abs(totalDelta);

  // The line with the biggest gap between the two quotes, in either direction. Ties go to the first in KEYS.
  let big: LineKey = 'rental';
  for (const k of KEYS) if (Math.abs(deltas[k]) > Math.abs(deltas[big])) big = k;
  const side = (cheaper.lines as Lines)[big] - (dearer.lines as Lines)[big];
  const bigGap = Math.abs(deltas[big]);

  const head = `${cheaperName} costs ${dollars(gap)} less than ${dearerName} over the whole trip.`;
  const tail =
    bigGap === 0
      ? ''
      : ` The biggest gap is ${LINE_NAMES[big]}: ${cheaperName}'s is ${dollars(bigGap)} ${side < 0 ? 'lower' : 'higher'}.`;
  return { totalDelta, deltas, sentence: head + tail };
}
