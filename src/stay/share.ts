/**
 * The stays in a link, after the "#" as `#t=v1.<text>`. Same rules as the trip link:
 * size capped, every field checked, anything odd dropped. Never throws.
 */

import { blankStay, MAX_STAYS, type StayForm, type StayTrip } from './stay';

export const MAX_STAY_FRAGMENT = 8_000;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const str = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : fallback;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function encodeStay(t: StayTrip): string {
  return `t=v1.${toBase64Url(JSON.stringify(t))}`;
}

function cleanStay(v: unknown, n: number): StayForm {
  const o = isObject(v) ? v : {};
  const base = blankStay(n, o['kind'] === 'rental' ? 'rental' : 'hotel');
  return {
    label: str(o['label'], 60, base.label),
    kind: base.kind,
    rate: str(o['rate'], 24),
    nights: str(o['nights'], 24),
    fees: str(o['fees'], 24),
    taxes: str(o['taxes'], 24),
    parking: str(o['parking'], 24),
    food: str(o['food'], 24),
    km: str(o['km'], 24),
  };
}

export function decodeStay(fragment: string): StayTrip | null {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (raw.length === 0 || raw.length > MAX_STAY_FRAGMENT) return null;
  const m = /^t=v1\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!m || !m[1]) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(m[1]));
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const stays = Array.isArray(parsed['stays']) ? parsed['stays'].slice(0, MAX_STAYS).map((s, i) => cleanStay(s, i + 1)) : [];
  return {
    people: str(parsed['people'], 24),
    l100: str(parsed['l100'], 24),
    fuel: str(parsed['fuel'], 24),
    stays: stays.length > 0 ? stays : [blankStay(1, 'hotel'), blankStay(2, 'rental')],
  };
}
