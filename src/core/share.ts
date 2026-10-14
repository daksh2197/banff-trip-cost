/**
 * State in a link.
 *
 * The form is packed into the part of the address after the "#", as `#s=v1.<text>`. Browsers never send that
 * part to a website, so what you type stays on your device and your friend's. Reading a link is treated as
 * reading hostile input: size capped, every field checked, anything odd falls back to a safe value or to nothing.
 */

import type { PassMode } from './pass';
import { blankQuote, emptyState, MAX_EXTRAS, MAX_QUOTES, type FormState, type QuoteForm, type RatingBasis } from './state';

const VERSION = 'v1';
export const MAX_FRAGMENT = 12_000;
const MODES: PassMode[] = ['auto', 'daily', 'discovery', 'none', 'typed'];
const BASES: RatingBasis[] = ['comb', 'hwy', 'city'];

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function encodeState(s: FormState): string {
  const { sample: _sample, ...rest } = s;
  return `s=${VERSION}.${toBase64Url(JSON.stringify(rest))}`;
}

function str(v: unknown, max: number, fallback = ''): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : fallback;
}

function int(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function cleanQuote(v: unknown, n: number): QuoteForm {
  const o = isObject(v) ? v : {};
  const extras = Array.isArray(o['extras']) ? o['extras'].slice(0, MAX_EXTRAS) : [];
  const base = blankQuote(n);
  return {
    label: str(o['label'], 60, base.label),
    rate: str(o['rate'], 24),
    days: str(o['days'], 24),
    fees: str(o['fees'], 24),
    l100: str(o['l100'], 24),
    vehicle: str(o['vehicle'], 120),
    extras: extras.map((e) => {
      const x = isObject(e) ? e : {};
      return { label: str(x['label'], 40), amount: str(x['amount'], 24) };
    }),
  };
}

/** Reads the text after the "#". Returns null for anything that is not a v1 link or cannot be read. */
export function decodeState(fragment: string): FormState | null {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (raw.length === 0 || raw.length > MAX_FRAGMENT) return null;
  const match = /^s=v1\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!match || !match[1]) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(match[1]));
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;

  const d = emptyState();
  const quotesIn = Array.isArray(parsed['quotes']) ? parsed['quotes'].slice(0, MAX_QUOTES) : [];
  const quotes = quotesIn.length > 0 ? quotesIn.map((q, i) => cleanQuote(q, i + 1)) : d.quotes;
  const mode = parsed['passMode'];
  const basis = parsed['basis'];
  return {
    routeId: str(parsed['routeId'], 40, d.routeId),
    oneWay: str(parsed['oneWay'], 24),
    extraKm: str(parsed['extraKm'], 24),
    fuelPrice: str(parsed['fuelPrice'], 24),
    adults: str(parsed['adults'], 8),
    seniors: str(parsed['seniors'], 8),
    youths: str(parsed['youths'], 8),
    parkDays: str(parsed['parkDays'], 8),
    passMode: MODES.includes(mode as PassMode) ? (mode as PassMode) : d.passMode,
    typedPass: str(parsed['typedPass'], 24),
    kDays: str(parsed['kDays'], 8),
    basis: BASES.includes(basis as RatingBasis) ? (basis as RatingBasis) : d.basis,
    quotes,
    cmpA: int(parsed['cmpA'], 0, quotes.length - 1, 0),
    cmpB: int(parsed['cmpB'], 0, quotes.length - 1, Math.min(1, quotes.length - 1)),
    sample: false,
  };
}
