/**
 * The wiring for the stay page. Reads boxes into `trip`, asks evaluateStays() for the answer, and paints it.
 * No arithmetic here.
 */

import '../styles/fonts.css';
import '../styles/brand.css';
import '../styles/app.css';

import { dollars } from '../core/format';
import { byId, el, setText } from '../ui/dom';
import { decodeStay, encodeStay } from './share';
import {
  blankStay,
  evaluateStays,
  MAX_STAYS,
  sampleStayTrip,
  STAY_FIELDS,
  STAY_LINE_LABELS,
  STAY_LINES,
  stayLabel,
  staySentence,
  type StayForm,
  type StayKind,
  type StayTrip,
} from './stay';

const blankTrip = (): StayTrip => ({ people: '', l100: '', fuel: '', stays: [blankStay(1, 'hotel'), blankStay(2, 'rental')] });

let trip: StayTrip;
let isSample = false;
const fromLink = decodeStay(location.hash);
if (fromLink) {
  trip = fromLink;
  byId('link-note').hidden = false;
} else {
  trip = sampleStayTrip();
  isSample = true;
}

const SHARED = ['people', 'l100', 'fuel'] as const;
for (const k of SHARED) {
  const input = byId<HTMLInputElement>(k);
  input.addEventListener('input', () => {
    trip[k] = input.value;
    changed();
  });
}

function stayCard(s: StayForm, i: number): HTMLElement {
  const id = (k: string) => `s${i}-${k}`;
  const input = (k: keyof StayForm, label: string, hint?: string) =>
    el(
      'div',
      { class: 'field' },
      el('label', { for: id(k) }, label),
      el('input', {
        id: id(k),
        type: 'text',
        inputmode: k === 'label' ? 'text' : 'decimal',
        autocomplete: 'off',
        'data-s': i,
        'data-k': k,
        value: s[k],
        'aria-describedby': `${id(k)}-err${hint ? ` ${id(k)}-hint` : ''}`,
      }),
      hint ? el('p', { class: 'hint', id: `${id(k)}-hint` }, hint) : null,
      el('p', { class: 'err', id: `${id(k)}-err` }),
    );
  const kind = el(
    'select',
    { id: id('kind'), 'data-s': i, 'data-k': 'kind' },
    el('option', { value: 'hotel' }, 'Hotel'),
    el('option', { value: 'rental' }, 'Airbnb, VRBO or other rental'),
  );
  kind.value = s.kind;
  const [rate, nights, ...rest] = STAY_FIELDS;
  return el(
    'fieldset',
    { class: 'qcard' },
    el('legend', {}, `Stay ${i + 1}`),
    el(
      'div',
      { class: 'qhead' },
      input('label', 'Name for this stay'),
      el('button', { type: 'button', class: 'btn btn-quiet', 'data-remove': i, disabled: trip.stays.length === 1, 'aria-label': `Remove stay ${i + 1}` }, 'Remove'),
    ),
    el('div', { class: 'field' }, el('label', { for: id('kind') }, 'Type'), kind),
    el('div', { class: 'row' }, input(rate!.key, rate!.label), input(nights!.key, nights!.label)),
    ...rest.map((f) => input(f.key, f.label, f.hint)),
  );
}

const list = byId('stay-list');
function renderCards(): void {
  list.replaceChildren(...trip.stays.map(stayCard));
  byId<HTMLButtonElement>('add-stay').hidden = trip.stays.length >= MAX_STAYS;
}

list.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  const i = Number(t.dataset['s']);
  const k = t.dataset['k'] as keyof StayForm | undefined;
  const s = trip.stays[i];
  if (!s || !k) return;
  if (k === 'kind') s.kind = t.value as StayKind;
  else s[k] = t.value;
  changed();
});
list.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-remove]');
  if (!b) return;
  trip.stays.splice(Number(b.dataset['remove']), 1);
  renderCards();
  changed();
});
byId('add-stay').addEventListener('click', () => {
  if (trip.stays.length >= MAX_STAYS) return;
  trip.stays.push(blankStay(trip.stays.length + 1, 'rental'));
  renderCards();
  changed();
});

function render(): void {
  const r = evaluateStays(trip);
  for (const k of SHARED) {
    const msg = r.shared.errors[k] ?? '';
    setText(byId(`${k}-err`), msg);
    byId(k).setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  for (const s of r.stays) {
    for (const f of ['rate', 'nights', 'fees', 'taxes', 'parking', 'food', 'km'] as const) {
      const out = document.getElementById(`s${s.index}-${f}-err`);
      if (!out) continue;
      // A blank required box on an untouched card is not an error yet; say so only once something is typed.
      const touched = Object.entries(trip.stays[s.index]!).some(([k, v]) => k !== 'label' && k !== 'kind' && v.trim() !== '');
      setText(out, !s.ok && touched ? (s.errors[f] ?? '') : '');
    }
  }

  const hero = byId('hero');
  const ranked = byId('ranked');
  const top = r.ranked[0];
  if (!top) {
    hero.replaceChildren(el('p', { class: 'hero-kicker' }, 'No total yet'), el('p', { class: 'hero-idle' }, 'Type a nightly rate and nights for one stay, and the whole-stay cost shows up here.'));
    ranked.replaceChildren();
    return;
  }
  const next = r.ranked[1];
  hero.replaceChildren(
    el('p', { class: 'hero-kicker' }, 'Cheapest stay'),
    el('p', { class: 'hero-total' }, dollars(top.total)),
    el(
      'p',
      { class: 'hero-sub' },
      `${top.label} · ${dollars(top.perNight)} a night${top.perPersonNight !== null ? ` · ${dollars(top.perPersonNight)} a person a night` : ''}`,
    ),
  );
  if (next) hero.append(el('p', { class: 'verdict-line' }, staySentence(top, next)));
  ranked.replaceChildren(
    ...r.ranked.map((p, n) =>
      el(
        'li',
        { class: 'rq' },
        el(
          'div',
          { class: 'rq-head' },
          el('span', { class: 'rank' }, el('span', { class: 'vh' }, 'Rank '), String(n + 1)),
          el('h3', {}, p.label),
          el('p', { class: 'rq-total' }, dollars(p.total)),
        ),
        el('p', { class: 'rq-day' }, `${dollars(p.perNight)} a night${p.perPersonNight !== null ? ` · ${dollars(p.perPersonNight)} a person a night` : ''}`),
        el(
          'dl',
          { class: 'lines' },
          ...STAY_LINES.filter((k) => p.lines[k] !== 0 || k === 'room').map((k) =>
            el('div', { class: 'line' }, el('dt', {}, STAY_LINE_LABELS[k]), el('dd', {}, el('span', { class: 'amt' }, dollars(p.lines[k])))),
          ),
        ),
      ),
    ),
    ...r.stays
      .filter((s) => !s.ok)
      .map((s) => el('li', { class: 'unpriced' }, el('strong', {}, stayLabel(trip.stays[s.index]!, s.index)), ': not priced yet. The boxes say what is missing.')),
  );
}

function changed(): void {
  isSample = false;
  byId('sample-note').hidden = true;
  byId('sample').hidden = false;
  history.replaceState(null, '', `#${encodeStay(trip)}`);
  render();
}

function fillShared(): void {
  for (const k of SHARED) byId<HTMLInputElement>(k).value = trip[k];
}

const toast = byId('toast');
const say = (t: string) => {
  setText(toast, t);
  window.setTimeout(() => setText(toast, ''), 4000);
};

byId('copy-link').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#${encodeStay(trip)}`;
  try {
    await navigator.clipboard.writeText(url);
    say('Link copied. Your numbers ride after the "#" and are never sent to a website.');
  } catch {
    const box = byId<HTMLTextAreaElement>('copy-fallback');
    box.value = url;
    box.hidden = false;
    box.select();
    say('Copy the link from the box.');
  }
});
byId('clear').addEventListener('click', () => {
  trip = blankTrip();
  fillShared();
  renderCards();
  changed();
  say('Cleared.');
});
byId('sample').addEventListener('click', () => {
  trip = sampleStayTrip();
  fillShared();
  renderCards();
  render();
  isSample = true;
  history.replaceState(null, '', location.pathname);
  byId('sample-note').hidden = false;
  byId('sample').hidden = true;
});

fillShared();
renderCards();
byId('sample-note').hidden = !isSample;
byId('sample').hidden = isSample;
render();
