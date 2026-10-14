/**
 * Fuel cost. One formula, all integers.
 *
 *   litres = km x (L/100 km) / 100
 *   cost   = litres x price per litre
 *
 * Inputs arrive in small whole units (see parse.ts): km, hundredths of L/100 km, and mills
 * (a mill is a thousandth of a dollar). The product is exact. It is rounded to a cent once, at the end,
 * half up, so there is no float drift to explain.
 */

/** Litres burned. This is for display only; the cost never goes through it. */
export function litresUsed(km: number, l100Hundredths: number): number {
  return (km * l100Hundredths) / 10_000;
}

/** Fuel cost in cents. 260 km at 8.00 L/100 km and $1.800/L: 20.8 L, 3744 cents. */
export function fuelCostCents(km: number, l100Hundredths: number, priceMills: number): number {
  // km x hundredths x mills / 100,000 = cents. Round half up with integer arithmetic.
  const numerator = km * l100Hundredths * priceMills;
  const divisor = 100_000;
  return Math.floor((2 * numerator + divisor) / (2 * divisor));
}
