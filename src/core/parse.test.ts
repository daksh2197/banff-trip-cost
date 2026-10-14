import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_MONEY_CENTS,
  parseCount,
  parseDays,
  parseExtraKm,
  parseKm,
  parseL100,
  parseMoney,
  parsePassDays,
  parsePricePerLitre,
  type Parsed,
} from './parse';

const value = (r: Parsed) => (r.ok ? r.value : `fail:${r.reason}`);

describe('money', () => {
  it('reads plain, dollar-signed and comma-grouped amounts as cents', () => {
    expect(value(parseMoney('12.25'))).toBe(1225);
    expect(value(parseMoney('$1,234.56'))).toBe(123456);
    expect(value(parseMoney(' $ 55 '))).toBe(5500);
    expect(value(parseMoney('234,567.89'))).toBe(23456789);
    expect(value(parseMoney('.5'))).toBe(50);
    expect(value(parseMoney('0'))).toBe(0);
  });

  it('reads the European layout 1.234,56 the same as 1,234.56', () => {
    expect(value(parseMoney('1.234,56'))).toBe(123456);
    expect(value(parseMoney('12,5'))).toBe(1250);
    expect(value(parseMoney('234.567,00'))).toBe(23456700);
  });

  it('treats a single comma with three digits after it as a thousands mark', () => {
    expect(value(parseMoney('1,234'))).toBe(123400);
  });

  it('refuses a dot with three digits after it on money, rather than guess', () => {
    expect(value(parseMoney('1.234'))).toBe('fail:too-many-decimals');
  });

  it('refuses a third decimal on money', () => {
    expect(value(parseMoney('1.2345'))).toBe('fail:too-many-decimals');
    expect(value(parseMoney('0.125'))).toBe('fail:too-many-decimals');
    expect(value(parseMoney('12.50'))).toBe(1250);
  });

  it('refuses a minus sign unless a discount is allowed', () => {
    expect(value(parseMoney('-50'))).toBe('fail:negative');
    expect(value(parseMoney('-50', 'the fees', true))).toBe(-5000);
    expect(value(parseMoney('−50', 'the fees', true))).toBe(-5000);
  });

  it('never returns negative zero', () => {
    for (const t of ['-0', '-0.00', '−0']) {
      const r = parseMoney(t, 'x', true);
      expect(r.ok && Object.is(r.value, -0)).toBe(false);
      expect(value(r)).toBe(0);
    }
  });

  it('rejects blanks, junk and number words', () => {
    for (const t of ['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity', '1e9', '12abc', '$$5', '1..2', '1,,2', '5.', '--5', '٣٤']) {
      expect(value(parseMoney(t, 'x', true)), JSON.stringify(t)).toMatch(/^fail:/);
    }
    expect(value(parseMoney(''))).toBe('fail:blank');
  });

  it('rejects amounts over $1,000,000 and absurd digit counts', () => {
    expect(value(parseMoney('1000000'))).toBe(MAX_MONEY_CENTS);
    expect(value(parseMoney('1000000.01'))).toBe('fail:too-large');
    expect(value(parseMoney('9'.repeat(40)))).toBe('fail:too-large');
  });

  it('writes messages that read as sentences', () => {
    const big = parseMoney('2000000', 'the daily rate');
    expect(!big.ok && big.message).toBe('The daily rate is over $1,000,000. Check it.');
    const junk = parseMoney('abc', 'the fees and taxes', true);
    expect(!junk.ok && junk.message).toBe('The fees and taxes should be a number, like 12.50.');
    const neg = parseMoney('-5', 'the daily rate');
    expect(!neg.ok && neg.message).toBe("The daily rate can't be negative.");
  });

  it('gives a message that names the box', () => {
    const r = parseMoney('', 'the daily rate');
    expect(!r.ok && r.message).toBe('Enter the daily rate.');
  });
});

describe('fuel price and fuel use', () => {
  it('reads a pump price to the tenth of a cent', () => {
    expect(value(parsePricePerLitre('1.659'))).toBe(1659);
    expect(value(parsePricePerLitre('$1.80'))).toBe(1800);
    expect(value(parsePricePerLitre('1,659'))).toBe(1659);
    expect(value(parsePricePerLitre('2'))).toBe(2000);
  });

  it('says a zero or blank price is missing, not free', () => {
    expect(value(parsePricePerLitre('0'))).toBe('fail:too-small');
    expect(value(parsePricePerLitre(''))).toBe('fail:blank');
    expect(value(parsePricePerLitre('-1.5'))).toBe('fail:negative');
    expect(value(parsePricePerLitre('11'))).toBe('fail:too-large');
  });

  it('reads L/100 km to the hundredth and bounds it', () => {
    expect(value(parseL100('8'))).toBe(800);
    expect(value(parseL100('8.5'))).toBe(850);
    expect(value(parseL100('8,55'))).toBe(855);
    expect(value(parseL100('0'))).toBe('fail:too-small');
    expect(value(parseL100('61'))).toBe('fail:too-large');
    expect(value(parseL100('60'))).toBe(6000);
    expect(value(parseL100('8.555'))).toBe('fail:too-many-decimals');
  });
});

describe('kilometres, days, counts', () => {
  it('reads whole kilometres with thousands marks', () => {
    expect(value(parseKm('260'))).toBe(260);
    expect(value(parseKm('1,200'))).toBe(1200);
    expect(value(parseKm('1.200'))).toBe('fail:ambiguous');
    expect(value(parseKm('12.5'))).toBe('fail:too-many-decimals');
  });

  it('rejects zero, negative and huge kilometres', () => {
    expect(value(parseKm('0'))).toBe('fail:too-small');
    expect(value(parseKm('-5'))).toBe('fail:negative');
    expect(value(parseKm('50001'))).toBe('fail:too-large');
    expect(value(parseKm('1e9'))).toBe('fail:invalid');
  });

  it('treats a blank extra distance as none', () => {
    expect(value(parseExtraKm(''))).toBe(0);
    expect(value(parseExtraKm('40'))).toBe(40);
    expect(value(parseExtraKm('-4'))).toBe('fail:negative');
  });

  it('wants whole days from 1 to 365', () => {
    expect(value(parseDays('4'))).toBe(4);
    expect(value(parseDays('0'))).toBe('fail:too-small');
    expect(value(parseDays('-2'))).toBe('fail:negative');
    expect(value(parseDays('0.5'))).toBe('fail:not-whole');
    expect(value(parseDays('366'))).toBe('fail:too-large');
    expect(value(parseDays('1000000000'))).toBe('fail:too-large');
  });

  it('counts people and park days, with blank meaning none', () => {
    expect(value(parseCount(''))).toBe(0);
    expect(value(parseCount('2'))).toBe(2);
    expect(value(parseCount('100'))).toBe('fail:too-large');
    expect(value(parsePassDays(''))).toBe(0);
    expect(value(parsePassDays('3'))).toBe(3);
  });
});

describe('whatever is typed', () => {
  it('never yields NaN, Infinity or a non-integer, and never throws', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (text) => {
        for (const r of [parseMoney(text, 'x', true), parsePricePerLitre(text), parseL100(text), parseKm(text), parseDays(text), parseCount(text)]) {
          if (r.ok) {
            expect(Number.isSafeInteger(r.value)).toBe(true);
            expect(Object.is(r.value, -0)).toBe(false);
          } else {
            expect(r.message.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('round-trips any amount of cents written two ways', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_MONEY_CENTS }), (cents) => {
        const plain = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
        const grouped = '$' + new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2 }).format(cents / 100);
        const european = grouped.slice(1).replace(/,/g, '\u0001').replace('.', ',').replace(/\u0001/g, '.');
        expect(value(parseMoney(plain))).toBe(cents);
        expect(value(parseMoney(grouped))).toBe(cents);
        // a european amount of 1.234,00 style always has a comma decimal, so it must agree too
        expect(value(parseMoney(european))).toBe(cents);
      }),
      { numRuns: 1500 },
    );
  });
});
