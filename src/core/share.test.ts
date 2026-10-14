import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, MAX_FRAGMENT } from './share';
import { emptyState, sampleState, type FormState } from './state';

describe('state in a link', () => {
  it('brings back exactly what was on screen', () => {
    const s: FormState = { ...sampleState(), sample: false };
    expect(decodeState('#' + encodeState(s))).toEqual(s);
  });

  it('survives labels in any script, emoji and quotes', () => {
    const s = emptyState();
    s.quotes[0]!.label = 'Dépanneur "Écu" \u{1F698} 車 <b>x</b>';
    const back = decodeState('#' + encodeState(s));
    expect(back?.quotes[0]?.label).toBe(s.quotes[0]!.label);
  });

  it('keeps the link after the hash and out of anything a server sees', () => {
    expect(encodeState(sampleState())).toMatch(/^s=v1\.[A-Za-z0-9_-]+$/);
  });

  it('round-trips any text typed into any box', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 24 }), fc.string({ maxLength: 24 }), (a, b) => {
        const s = emptyState();
        s.fuelPrice = a.replace(/[\u0000-\u001f\u007f]/g, '');
        s.quotes[0]!.rate = b.replace(/[\u0000-\u001f\u007f]/g, '');
        // lone surrogates cannot be written as UTF-8, so the encoder would change them; skip those
        if (/[\ud800-\udfff]/.test(s.fuelPrice + s.quotes[0]!.rate)) return;
        const back = decodeState('#' + encodeState(s));
        expect(back?.fuelPrice).toBe(s.fuelPrice);
        expect(back?.quotes[0]?.rate).toBe(s.quotes[0]!.rate);
      }),
      { numRuns: 500 },
    );
  });
});

describe('a link that cannot be trusted', () => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');

  it('reads nothing from empty, wrong-version, cut-off or oversized links', () => {
    for (const bad of ['', '#', '#s=', '#s=v2.abc', '#s=v1.', '#x=1', '#s=v1.!!!', '#s=v1.' + 'A'.repeat(MAX_FRAGMENT)]) {
      expect(decodeState(bad), bad.slice(0, 20)).toBeNull();
    }
    const full = encodeState(sampleState());
    expect(decodeState('#' + full.slice(0, full.length - 9))).toBeNull();
  });

  it('reads nothing from valid text that is not an object', () => {
    for (const v of [1, 'x', null, [], true]) expect(decodeState('#s=v1.' + b64(v))).toBeNull();
  });

  it('reads nothing from invalid UTF-8', () => {
    expect(decodeState('#s=v1.' + Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url'))).toBeNull();
  });

  it('replaces wrong types and unknown choices with safe values', () => {
    const s = decodeState(
      '#s=v1.' + b64({ routeId: 42, passMode: 'free', basis: 'x', fuelPrice: { a: 1 }, quotes: 'no', cmpA: 99, cmpB: -1, adults: ['2'] }),
    );
    expect(s).not.toBeNull();
    expect(s!.passMode).toBe('auto');
    expect(s!.basis).toBe('comb');
    expect(s!.fuelPrice).toBe('');
    expect(s!.quotes).toHaveLength(1);
    expect(s!.cmpA).toBe(0);
    expect(s!.cmpB).toBe(0);
    expect(s!.routeId).toBe('banff');
  });

  it('caps quotes at 10, extras at 6 and every string by length', () => {
    const quote = { label: 'L'.repeat(70), rate: '9'.repeat(30), extras: Array.from({ length: 8 }, () => ({ label: 'e'.repeat(45), amount: '1' })) };
    const s = decodeState('#s=v1.' + b64({ quotes: Array.from({ length: 12 }, () => quote) }));
    expect(s!.quotes).toHaveLength(10);
    expect(s!.quotes[0]!.label).toHaveLength(60);
    expect(s!.quotes[0]!.rate).toHaveLength(24);
    expect(s!.quotes[0]!.extras).toHaveLength(6);
    expect(s!.quotes[0]!.extras[0]!.label).toHaveLength(40);
  });

  it('refuses a link far bigger than any real trip', () => {
    const quote = { label: 'L'.repeat(500), extras: Array.from({ length: 50 }, () => ({ label: 'e'.repeat(200), amount: '1' })) };
    expect(decodeState('#s=v1.' + b64({ quotes: Array.from({ length: 40 }, () => quote) }))).toBeNull();
  });

  it('keeps script text as text and strips control characters', () => {
    const s = decodeState('#s=v1.' + b64({ quotes: [{ label: '<img src=x onerror=alert(1)>\u0000\u001b[31m' }] }));
    expect(s!.quotes[0]!.label).toBe('<img src=x onerror=alert(1)>[31m');
  });

  it('never throws on random junk', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (junk) => {
        const r = decodeState('#s=v1.' + junk);
        expect(r === null || Array.isArray(r.quotes)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});
