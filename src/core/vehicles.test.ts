import { describe, expect, it } from 'vitest';
import { classAverage, classesOf, isVehicle, ratingOf, searchVehicles, toHundredths, vehicleKey, vehicleLabel, type Vehicle } from './vehicles';

// Invented rows for the tests. The makes do not exist.
const base: Vehicle = { year: 2026, make: 'Samplecar', model: 'Alpha', cls: 'Compact', engineL: 1.5, cyl: 4, trans: 'A8', fuel: 'X', city: 9, hwy: 6.5, comb: 7.9 };
const list: Vehicle[] = [
  base,
  { ...base, model: 'Alpha Sport', engineL: 2, comb: 8.7, hwy: 7.1, city: 10.6 },
  { ...base, make: 'Testmotor', model: 'Big Hauler', cls: 'Pickup', engineL: 5.7, cyl: 8, fuel: 'Z', comb: 13.2, hwy: 11.1, city: 16 },
];

describe('vehicles', () => {
  it('accepts a well-formed row and rejects the bad ones', () => {
    expect(isVehicle(base)).toBe(true);
    expect(isVehicle({ ...base, comb: 0 })).toBe(false);
    expect(isVehicle({ ...base, comb: 31 })).toBe(false);
    expect(isVehicle({ ...base, comb: NaN })).toBe(false);
    expect(isVehicle({ ...base, fuel: 'B' })).toBe(false);
    expect(isVehicle({ ...base, make: '' })).toBe(false);
    expect(isVehicle({ ...base, year: 1899 })).toBe(false);
    expect(isVehicle(null)).toBe(false);
    expect(isVehicle('x')).toBe(false);
  });

  it('gives each listing its own key', () => {
    expect(new Set(list.map(vehicleKey)).size).toBe(3);
    expect(vehicleKey(base)).toBe('2026|Samplecar|Alpha|1.5|4|A8|X|Compact|9|6.5|7.9');
  });

  it('keeps two rows that differ only in their ratings or class apart', () => {
    expect(vehicleKey({ ...base, comb: 12 })).not.toBe(vehicleKey(base));
    expect(vehicleKey({ ...base, city: 9.5 })).not.toBe(vehicleKey(base));
    expect(vehicleKey({ ...base, cls: 'Midsize' })).not.toBe(vehicleKey(base));
  });

  it('picks the rating for combined, highway or city and stores it exactly as hundredths', () => {
    expect(ratingOf(base, 'comb')).toBe(7.9);
    expect(ratingOf(base, 'hwy')).toBe(6.5);
    expect(ratingOf(base, 'city')).toBe(9);
    expect(toHundredths(7.9)).toBe(790);
    expect(toHundredths(10.6)).toBe(1060);
  });

  it('finds models by every word typed, in any case', () => {
    expect(searchVehicles(list, 'alpha', '').map((v) => v.model)).toEqual(['Alpha', 'Alpha Sport']);
    expect(searchVehicles(list, 'SAMPLECAR sport', '').map((v) => v.model)).toEqual(['Alpha Sport']);
    expect(searchVehicles(list, '2026 hauler', '')).toHaveLength(1);
    expect(searchVehicles(list, 'zzz', '')).toEqual([]);
    expect(searchVehicles(list, '', 'Pickup')).toHaveLength(1);
    expect(searchVehicles(list, '', '', 2)).toHaveLength(2);
  });

  it('lists classes once, sorted', () => {
    expect(classesOf(list)).toEqual(['Compact', 'Pickup']);
  });

  it('averages a class from the listings in it: (7.9 + 8.7) / 2 = 8.3', () => {
    expect(classAverage(list, 'Compact', 'comb')).toEqual({ hundredths: 830, count: 2 });
    expect(classAverage(list, 'Compact', 'hwy')).toEqual({ hundredths: 680, count: 2 });
    expect(classAverage(list, 'Nothing', 'comb')).toBeNull();
  });

  it('writes a readable label', () => {
    expect(vehicleLabel(base)).toBe('2026 Samplecar Alpha · Compact · 1.5 L 4 cyl · A8');
    expect(vehicleLabel({ ...base, engineL: null, cyl: null })).toBe('2026 Samplecar Alpha · Compact · A8');
  });
});
