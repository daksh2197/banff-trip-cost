/**
 * Showing numbers. Money is whole cents everywhere in the app and becomes text only here.
 * Every function returns a safe string: no NaN, no Infinity, no "-0".
 */

const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol' });

/** 12345 -> "$123.45". -500 -> "-$5.00". Anything that is not a safe integer shows as an en dash. */
export function dollars(cents: number): string {
  if (!Number.isSafeInteger(cents)) return '–';
  const text = CAD.format(Math.abs(cents) / 100);
  return cents < 0 ? `−${text}` : text;
}

/** Litres to one decimal: 19.5 -> "19.5 L". */
export function litresText(litres: number): string {
  if (!Number.isFinite(litres) || litres < 0) return '–';
  return `${(Math.round(litres * 10) / 10).toFixed(1)} L`;
}

/** Hundredths of L/100 km: 850 -> "8.5". Two decimals only when needed: 855 -> "8.55". */
export function l100Text(hundredths: number): string {
  if (!Number.isSafeInteger(hundredths) || hundredths < 0) return '–';
  const text = (hundredths / 100).toFixed(2);
  return text.endsWith('0') ? text.slice(0, -1) : text;
}

/** Thousandths of a dollar: 1659 -> "$1.659/L". */
export function pricePerLitreText(mills: number): string {
  if (!Number.isSafeInteger(mills) || mills < 0) return '–';
  return `$${(mills / 1000).toFixed(3)}/L`;
}

/** Whole kilometres with thousands marks: 1200 -> "1,200 km". */
export function kmText(km: number): string {
  if (!Number.isSafeInteger(km) || km < 0) return '–';
  return `${new Intl.NumberFormat('en-CA').format(km)} km`;
}

/** Cents back to something a person can type into a box: 1225 -> "12.25". */
export function centsToInput(cents: number): string {
  if (!Number.isSafeInteger(cents)) return '';
  const abs = Math.abs(cents);
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${text}` : text;
}
