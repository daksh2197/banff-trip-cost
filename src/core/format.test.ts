import { describe, expect, it } from 'vitest';
import { centsToInput, dollars, kmText, l100Text, litresText, pricePerLitreText } from './format';

describe('showing numbers', () => {
  it('formats cents as Canadian dollars', () => {
    expect(dollars(0)).toBe('$0.00');
    expect(dollars(1225)).toBe('$12.25');
    expect(dollars(123456)).toBe('$1,234.56');
    expect(dollars(-500)).toBe('−$5.00');
  });

  it('shows a dash instead of NaN, Infinity or a fraction', () => {
    for (const bad of [NaN, Infinity, -Infinity, 1.5]) expect(dollars(bad)).toBe('–');
    expect(kmText(NaN)).toBe('–');
    expect(litresText(NaN)).toBe('–');
    expect(l100Text(NaN)).toBe('–');
    expect(pricePerLitreText(NaN)).toBe('–');
  });

  it('never writes minus zero', () => {
    expect(dollars(-0)).toBe('$0.00');
    expect(centsToInput(-0)).toBe('0.00');
  });

  it('formats litres, ratings, prices and kilometres', () => {
    expect(litresText(19.5)).toBe('19.5 L');
    expect(l100Text(750)).toBe('7.5');
    expect(l100Text(855)).toBe('8.55');
    expect(l100Text(800)).toBe('8.0');
    expect(pricePerLitreText(1659)).toBe('$1.659/L');
    expect(kmText(1200)).toBe('1,200 km');
  });

  it('turns cents back into something typeable', () => {
    expect(centsToInput(1225)).toBe('12.25');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(-5000)).toBe('-50.00');
  });
});
