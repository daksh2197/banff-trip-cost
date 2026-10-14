/**
 * Parks Canada admission for one vehicle.
 *
 * Prices live in src/data/reference.json with the page they came from and the date they were checked.
 * Nothing here knows a dollar amount; it only applies the rules to whatever table it is given.
 *
 * Rules the code follows, all from Parks Canada's fee page:
 *   - Youth (6 to 17) are free.
 *   - A family or group in one vehicle, up to 7 people, pays one flat daily rate if that is cheaper.
 *   - The Discovery Pass is the same idea for a year.
 * The calculator counts the park days you enter. It does not work out the 4 pm rule for you.
 */

export interface PassTable {
  dailyCents: { adult: number; senior: number; youth: number; familyGroup: number };
  discoveryCents: { adult: number; senior: number; familyGroup: number };
  maxPerVehicle: number;
}

export interface Party {
  adults: number;
  seniors: number;
  youths: number;
}

export type PassMode = 'auto' | 'daily' | 'discovery' | 'none' | 'typed';

export interface PassCost {
  cents: number;
  /** What was chosen, in words a person can read. */
  basis: string;
  /** Short caveats for the screen. */
  notes: string[];
}

export function partySize(p: Party): number {
  return p.adults + p.seniors + p.youths;
}

/** Admission for the whole party for one day. Youth are free. */
export function dailyForParty(p: Party, t: PassTable): { cents: number; flat: boolean } {
  const each = p.adults * t.dailyCents.adult + p.seniors * t.dailyCents.senior + p.youths * t.dailyCents.youth;
  const size = partySize(p);
  if (size > 0 && size <= t.maxPerVehicle && t.dailyCents.familyGroup < each) return { cents: t.dailyCents.familyGroup, flat: true };
  return { cents: each, flat: false };
}

/** A Discovery Pass for the whole party. */
export function discoveryForParty(p: Party, t: PassTable): { cents: number; flat: boolean } {
  const each = p.adults * t.discoveryCents.adult + p.seniors * t.discoveryCents.senior;
  const size = partySize(p);
  if (each > 0 && size <= t.maxPerVehicle && t.discoveryCents.familyGroup < each) return { cents: t.discoveryCents.familyGroup, flat: true };
  return { cents: each, flat: false };
}

/**
 * The park pass line for a trip.
 * `typedCents` is used only in 'typed' mode. 'none' means the traveller already has a pass or never stops in a park.
 */
export function passCost(mode: PassMode, party: Party, parkDays: number, t: PassTable, typedCents = 0): PassCost {
  const notes: string[] = [];
  if (partySize(party) > t.maxPerVehicle) {
    notes.push(`More than ${t.maxPerVehicle} people do not fit the family rate, so everyone is priced one by one.`);
  }
  if (mode === 'none') return { cents: 0, basis: 'No pass bought here', notes };
  if (mode === 'typed') return { cents: typedCents, basis: 'Amount you typed', notes };

  const day = dailyForParty(party, t);
  const daily = day.cents * parkDays;
  const dailyBasis = `${parkDays} park ${parkDays === 1 ? 'day' : 'days'} at the ${day.flat ? 'family/group' : 'individual'} daily rate`;
  const disc = discoveryForParty(party, t);
  const discBasis = `Discovery Pass, ${disc.flat ? 'family/group' : 'one per person'}`;

  if (mode === 'daily') return { cents: daily, basis: dailyBasis, notes };
  if (mode === 'discovery') return { cents: disc.cents, basis: discBasis, notes };
  // auto: the cheaper of the two. A tie goes to the daily pass, which commits you to less.
  if (disc.cents < daily) return { cents: disc.cents, basis: `${discBasis} (cheaper than daily passes for ${parkDays} days)`, notes };
  return { cents: daily, basis: dailyBasis, notes };
}
