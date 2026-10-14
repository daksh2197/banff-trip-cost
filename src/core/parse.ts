/**
 * Reading numbers people type.
 *
 * People paste "$1,234.56", "1.234,56", "8,5", " 260 km " and worse. Every function here
 * returns either a clean integer or a reason in plain words. Nothing here ever returns NaN,
 * Infinity or -0, and nothing throws.
 *
 * All values are integers in a small unit so that money and fuel maths never touch a float:
 *   money  -> cents          ($12.25  = 1225)
 *   price  -> mills          ($1.659/L = 1659)   one mill is a tenth of a cent
 *   rating -> hundredths     (8.5 L/100 km = 850)
 */

export type ParseReason = 'blank' | 'invalid' | 'too-many-decimals' | 'ambiguous' | 'too-large' | 'too-small' | 'negative' | 'not-whole';

export type Parsed = { ok: true; value: number } | { ok: false; reason: ParseReason; message: string };

interface Split {
  negative: boolean;
  int: string;
  frac: string;
}

type SplitResult = { ok: true; split: Split } | { ok: false; reason: ParseReason };

const MAX_INT_DIGITS = 12;

function groupsOk(digits: string, sep: string): boolean {
  const parts = digits.split(sep);
  if (parts.some((p) => !/^\d+$/.test(p))) return false;
  if ((parts[0] ?? '').length > 3 || (parts[0] ?? '').length === 0) return false;
  return parts.slice(1).every((p) => p.length === 3);
}

/** Splits typed text into sign, whole digits and fraction digits. Handles both "1,234.56" and "1.234,56". */
function split(text: string, maxDecimals: number): SplitResult {
  let s = text.normalize('NFKC').replace(/\s+/g, '');
  if (s === '') return { ok: false, reason: 'blank' };

  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/^(?:CAD|C\$|\$)/i, '');
  if (s === '') return { ok: false, reason: 'blank' };
  if (!/^[0-9.,]+$/.test(s)) return { ok: false, reason: 'invalid' };

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let intText = s;
  let frac = '';

  if (dots > 0 && commas > 0) {
    // Whichever separator comes last, once, is the decimal point. The other is the thousands mark.
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    const decimalIsDot = lastDot > lastComma;
    const dec = decimalIsDot ? '.' : ',';
    const thou = decimalIsDot ? ',' : '.';
    if ((decimalIsDot ? dots : commas) !== 1) return { ok: false, reason: 'invalid' };
    const at = s.lastIndexOf(dec);
    intText = s.slice(0, at);
    frac = s.slice(at + 1);
    if (!groupsOk(intText, thou)) return { ok: false, reason: 'invalid' };
    intText = intText.split(thou).join('');
  } else if (dots + commas > 0) {
    const sep = dots > 0 ? '.' : ',';
    const n = dots > 0 ? dots : commas;
    if (n > 1) {
      if (!groupsOk(s, sep)) return { ok: false, reason: 'invalid' };
      intText = s.split(sep).join('');
    } else {
      const at = s.indexOf(sep);
      const before = s.slice(0, at);
      const after = s.slice(at + 1);
      if (after === '') return { ok: false, reason: 'invalid' };
      if (after.length === 3 && maxDecimals < 3 && before !== '' && sep === ',' && groupsOk(s, ',')) {
        // "1,234" is a thousand and some.
        intText = before + after;
      } else if (after.length === 3 && maxDecimals === 0 && before !== '' && sep === '.') {
        // "1.200" km could be 1.2 or 1,200. Ask rather than guess.
        return { ok: false, reason: 'ambiguous' };
      } else {
        intText = before;
        frac = after;
      }
    }
  }

  if (intText === '') intText = '0';
  if (!/^\d+$/.test(intText) || (frac !== '' && !/^\d+$/.test(frac))) return { ok: false, reason: 'invalid' };
  intText = intText.replace(/^0+(?=\d)/, '');
  frac = frac.replace(/0+$/, '');
  if (frac.length > maxDecimals) return { ok: false, reason: 'too-many-decimals' };
  if (intText.length > MAX_INT_DIGITS) return { ok: false, reason: 'too-large' };
  return { ok: true, split: { negative, int: intText, frac } };
}

const cap = (t: string) => `${t[0]?.toUpperCase() ?? ''}${t.slice(1)}`;

function fail(reason: ParseReason, message: string): Parsed {
  return { ok: false, reason, message };
}

function messageFor(reason: ParseReason, what: string, decimals: number): string {
  switch (reason) {
    case 'blank':
      return `Enter ${what}.`;
    case 'invalid':
      return `${cap(what)} should be a number, like 12.50.`;
    case 'too-many-decimals':
      return decimals === 0 ? `Use whole numbers for ${what}.` : `Use at most ${decimals} decimal places for ${what}.`;
    case 'ambiguous':
      return `Can't tell if that is a decimal point or a thousands mark. Write it as 1200 or 1,200.`;
    default:
      return `Check ${what}.`;
  }
}

/** Core reader: digits to an integer in units of 10^-decimals, with limits. */
function toUnits(
  text: string,
  decimals: number,
  what: string,
  opts: { min: number; max: number; allowNegative?: boolean; minMessage?: string; maxMessage?: string },
): Parsed {
  const r = split(text, decimals);
  if (!r.ok) return fail(r.reason, messageFor(r.reason, what, decimals));
  const { negative, int, frac } = r.split;
  const magnitude = Number(int) * 10 ** decimals + Number(frac.padEnd(decimals, '0') || '0');
  if (!Number.isSafeInteger(magnitude)) return fail('too-large', opts.maxMessage ?? `${cap(what)} is too large.`);
  if (negative && magnitude !== 0 && !opts.allowNegative) return fail('negative', `${cap(what)} can't be negative.`);
  const value = negative && magnitude !== 0 ? -magnitude : magnitude;
  if (value > opts.max) return fail('too-large', opts.maxMessage ?? `${cap(what)} is too large.`);
  if (value < opts.min) return fail('too-small', opts.minMessage ?? `${cap(what)} is too small.`);
  return { ok: true, value: value === 0 ? 0 : value };
}

/** Largest dollar amount accepted on any line: $1,000,000. */
export const MAX_MONEY_CENTS = 100_000_000;

/** "$1,234.56" -> 123456. Negative allowed only where asked (a discount line). */
export function parseMoney(text: string, what = 'the amount', allowNegative = false): Parsed {
  return toUnits(text, 2, what, {
    min: allowNegative ? -MAX_MONEY_CENTS : 0,
    max: MAX_MONEY_CENTS,
    allowNegative,
    maxMessage: `${cap(what)} is over $1,000,000. Check it.`,
  });
}

/** Pump price in dollars per litre, to the tenth of a cent. "1.659" -> 1659. Zero is not a price. */
export const MAX_PRICE_MILLS = 10_000;
export function parsePricePerLitre(text: string): Parsed {
  return toUnits(text, 3, 'the fuel price per litre', {
    min: 1,
    max: MAX_PRICE_MILLS,
    minMessage: 'Enter a fuel price above zero.',
    maxMessage: 'A price over $10.00 a litre looks like a typo.',
  });
}

/** Fuel use in litres per 100 km, to the hundredth. "8.5" -> 850. Must be above zero and at most 60. */
export const MAX_L100_HUNDREDTHS = 6000;
export function parseL100(text: string): Parsed {
  return toUnits(text, 2, 'the fuel use in L/100 km', {
    min: 1,
    max: MAX_L100_HUNDREDTHS,
    minMessage: 'Fuel use has to be above zero. Electric vehicles are not covered.',
    maxMessage: 'Fuel use over 60 L/100 km looks like a typo.',
  });
}

/** Whole kilometres, 1 to 50,000. */
export const MAX_KM = 50_000;
export function parseKm(text: string, what = 'the kilometres'): Parsed {
  return toUnits(text, 0, what, { min: 1, max: MAX_KM, minMessage: 'Kilometres have to be at least 1.', maxMessage: 'Over 50,000 km is not a road trip.' });
}

/** Whole kilometres, 0 to 50,000 (for the extra driving box, where blank means none). */
export function parseExtraKm(text: string): Parsed {
  if (text.trim() === '') return { ok: true, value: 0 };
  return toUnits(text, 0, 'the extra kilometres', { min: 0, max: MAX_KM, maxMessage: 'Over 50,000 km is not a road trip.' });
}

/** Whole days, 1 to 365. */
export function parseDays(text: string, what = 'the days'): Parsed {
  const r = toUnits(text, 0, what, { min: 1, max: 365, minMessage: 'Days have to be at least 1.', maxMessage: 'More than 365 days is not a trip.' });
  if (!r.ok && r.reason === 'too-many-decimals') return fail('not-whole', 'Use whole days. A part day is usually billed as a full one.');
  return r;
}

/** A head count, 0 to 99. Blank counts as zero. */
export function parseCount(text: string, what = 'the number'): Parsed {
  if (text.trim() === '') return { ok: true, value: 0 };
  return toUnits(text, 0, what, { min: 0, max: 99, maxMessage: 'That is more people than one vehicle holds.' });
}

/** Whole pass-days, 0 to 365. Blank counts as zero. */
export function parsePassDays(text: string): Parsed {
  if (text.trim() === '') return { ok: true, value: 0 };
  return toUnits(text, 0, 'the park days', { min: 0, max: 365, maxMessage: 'More than 365 days is not a trip.' });
}
