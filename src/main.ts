/**
 * The wiring: the form on one side, the pure maths in src/core on the other.
 * Nothing here does arithmetic. It reads boxes into `state`, asks evaluate() for the answer, and paints it.
 */

import './styles/fonts.css';
import './styles/brand.css';
import './styles/app.css';

import { SOURCES } from '../pipeline/sources';
import reference from './data/reference.json';
import { compareQuotes } from './core/compare';
import { evaluate, type Evaluation, type Problems, type Reference, type RouteRef } from './core/evaluate';
import { dollars, kmText, l100Text, litresText, pricePerLitreText } from './core/format';
import { decodeState, encodeState } from './core/share';
import { blankQuote, emptyState, MAX_EXTRAS, MAX_QUOTES, sampleState, type FormState, type QuoteForm } from './core/state';
import {
  classAverage,
  classesOf,
  FUEL_NAMES,
  isVehicle,
  ratingOf,
  searchVehicles,
  toHundredths,
  vehicleKey,
  vehicleLabel,
  type Vehicle,
} from './core/vehicles';
import { byId, el, link, setIfChanged, setText } from './ui/dom';

interface RouteFull extends RouteRef {
  method: 'official' | 'derived' | 'typed';
  basis: string;
  sourceUrls: string[];
}

interface RefData extends Reference {
  checkedOn: string;
  routes: RouteFull[];
  kpass: { dayCents: number; source: string };
  winterRules: { text: string; source: string }[];
  sources: { id: string; title: string; url: string; used: string; terms: string; checkedOn: string; pageDate: string | null }[];
}

const ref = reference as unknown as RefData;
const R: Reference = ref;

// ---------- state ----------

let state: FormState = emptyState();
let vehicles: Vehicle[] = [];
let vehicleMap = new Map<string, Vehicle>();
let vehicleStatus: 'loading' | 'ready' | 'empty' | 'failed' = 'loading';
let provenanceLine = '';
const openPickers = new Set<number>();

const query = new URLSearchParams(location.search);
if (query.has('embed')) document.documentElement.dataset['embed'] = '';

// ---------- small helpers ----------

const FIELD_IDS: Record<string, string> = {
  oneWay: 'oneway',
  extraKm: 'extrakm',
  fuelPrice: 'fuelprice',
  adults: 'adults',
  seniors: 'seniors',
  youths: 'youths',
  parkDays: 'parkdays',
  typedPass: 'typedpass',
  kDays: 'kdays',
};

const TRIP_BOXES: Record<string, keyof FormState> = {
  oneway: 'oneWay',
  extrakm: 'extraKm',
  fuelprice: 'fuelPrice',
  adults: 'adults',
  seniors: 'seniors',
  youths: 'youths',
  parkdays: 'parkDays',
  typedpass: 'typedPass',
  kdays: 'kDays',
};

function showProblem(inputId: string, problems: Problems, key: string): void {
  const input = document.getElementById(inputId);
  const out = document.getElementById(`${inputId}-err`);
  if (!input || !out) return;
  const p = problems[key];
  const bad = p && !p.blank ? p.message : '';
  setText(out, bad);
  if (bad) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function qLabel(q: QuoteForm, i: number): string {
  const t = q.label.trim();
  return t === '' ? `Quote ${i + 1}` : t;
}

function selectedRoute() {
  return ref.routes.find((r) => r.id === state.routeId);
}

// ---------- writing state into the boxes ----------

function fillTripForm(): void {
  const route = byId<HTMLSelectElement>('route');
  route.replaceChildren(
    ...ref.routes.map((r) => el('option', { value: r.id }, r.label)),
    el('option', { value: '' }, 'My own route (type the distance)'),
  );
  route.value = ref.routes.some((r) => r.id === state.routeId) ? state.routeId : '';
  if (route.value === '' && state.routeId !== '') state.routeId = '';
  for (const [id, key] of Object.entries(TRIP_BOXES)) byId<HTMLInputElement>(id).value = String(state[key] ?? '');
  byId<HTMLSelectElement>('passmode').value = state.passMode;
  byId<HTMLSelectElement>('basis').value = state.basis;
  syncVisibility();
}

function syncVisibility(): void {
  const route = selectedRoute();
  byId('oneway-field').hidden = !!route && route.oneWayKm !== null;
  byId('kdays-field').hidden = !route?.kpass;
  byId('typedpass-field').hidden = state.passMode !== 'typed';
  byId('basis-field').hidden = vehicles.length === 0;
  const basisText = route
    ? `${route.method === 'official' ? 'Official figure' : route.method === 'derived' ? 'Added up from official pages' : 'No official figure'}: ${route.basis}`
    : 'Type the one-way distance from your own start, in kilometres. The calculator doubles it for the round trip.';
  setText(byId('route-basis'), basisText);
}

// ---------- quote cards ----------

function field(id: string, label: string, bind: string, q: number, value: string, opts: { hint?: string; inputmode?: string } = {}): HTMLElement {
  const full = `q${q}-${id}`;
  return el(
    'div',
    { class: 'field' },
    el('label', { for: full }, label),
    el('input', {
      id: full,
      type: 'text',
      inputmode: opts.inputmode ?? 'decimal',
      autocomplete: 'off',
      'data-q': q,
      'data-bind': bind,
      value,
      'aria-describedby': `${opts.hint ? `${full}-hint ` : ''}${full}-err`,
    }),
    opts.hint ? el('p', { class: 'hint', id: `${full}-hint` }, opts.hint) : null,
    el('p', { class: 'err', id: `${full}-err` }),
  );
}

function extraRow(q: number, i: number, e: { label: string; amount: string }): HTMLElement {
  const base = `q${q}-extra${i}`;
  return el(
    'div',
    { class: 'extra-row' },
    el(
      'div',
      { class: 'field' },
      el('label', { for: `${base}-label` }, `Extra ${i + 1}: what it is`),
      el('input', { id: `${base}-label`, type: 'text', maxlength: 40, autocomplete: 'off', list: 'extra-names', 'data-q': q, 'data-extra': i, 'data-ebind': 'label', value: e.label }),
    ),
    el(
      'div',
      { class: 'field' },
      el('label', { for: `${base}` }, `Extra ${i + 1}: amount ($)`),
      el('input', { id: base, type: 'text', inputmode: 'decimal', autocomplete: 'off', 'data-q': q, 'data-extra': i, 'data-ebind': 'amount', value: e.amount, 'aria-describedby': `${base}-err` }),
      el('p', { class: 'err', id: `${base}-err` }),
    ),
    el('button', { type: 'button', class: 'btn btn-quiet', 'data-action': 'remove-extra', 'data-q': q, 'data-extra': i, 'aria-label': `Remove extra ${i + 1}` }, 'Remove'),
  );
}

function pickerFor(q: number): HTMLElement | null {
  if (vehicles.length === 0) return null;
  const classes = classesOf(vehicles);
  const box = el(
    'details',
    { class: 'picker', 'data-q': q, open: openPickers.has(q) },
    el('summary', {}, 'Pick a vehicle from the government ratings'),
    el(
      'div',
      { class: 'row' },
      el('div', { class: 'field' }, el('label', { for: `q${q}-cls` }, 'Vehicle class'), el('select', { id: `q${q}-cls`, 'data-q': q, 'data-pick': 'cls' }, el('option', { value: '' }, 'All classes'), ...classes.map((c) => el('option', { value: c }, c)))),
      el('div', { class: 'field' }, el('label', { for: `q${q}-find` }, 'Search make, model or year'), el('input', { id: `q${q}-find`, type: 'search', autocomplete: 'off', 'data-q': q, 'data-pick': 'find' })),
    ),
    el('div', { class: 'field' }, el('label', { for: `q${q}-models` }, 'Models'), el('select', { id: `q${q}-models`, size: 6, 'data-q': q, 'data-pick': 'model' })),
    el('p', { class: 'hint', id: `q${q}-count` }),
    el('button', { type: 'button', class: 'btn btn-quiet', 'data-action': 'class-average', 'data-q': q }, 'Use the average for the class above'),
  );
  return box;
}

function buildQuoteCard(q: QuoteForm, i: number): HTMLElement {
  const only = state.quotes.length === 1;
  const card = el(
    'fieldset',
    { class: 'qcard', 'data-q': i },
    el('legend', {}, `Quote ${i + 1}`),
    el(
      'div',
      { class: 'qhead' },
      field('label', 'Name for this quote', 'label', i, q.label, { inputmode: 'text' }),
      el('button', { type: 'button', class: 'btn btn-quiet', 'data-action': 'remove-quote', 'data-q': i, disabled: only, 'aria-label': `Remove quote ${i + 1}` }, 'Remove quote'),
    ),
    el('div', { class: 'row' }, field('rate', 'Daily rate ($)', 'rate', i, q.rate), field('days', 'Rental days', 'days', i, q.days, { inputmode: 'numeric' })),
    field('fees', 'Fees and taxes, as quoted ($)', 'fees', i, q.fees, { hint: 'The total of everything the offer adds. A blank counts as $0. A discount can be negative.' }),
    field('l100', 'Fuel use (L/100 km)', 'l100', i, q.l100, { hint: 'From the vehicle you will drive. The picker below fills it from the ratings, or type your own.' }),
    el('p', { class: 'vehicle-line', id: `q${i}-vehicle` }),
    pickerFor(i),
    el('div', { id: `q${i}-extras` }, ...q.extras.map((e, n) => extraRow(i, n, e))),
    el(
      'button',
      { type: 'button', class: 'btn btn-quiet', 'data-action': 'add-extra', 'data-q': i, disabled: q.extras.length >= MAX_EXTRAS },
      q.extras.length >= MAX_EXTRAS ? 'Most extras added' : 'Add a winter extra (tires, chains, insurance, second driver)',
    ),
  );
  return card;
}

function renderQuotes(): void {
  const list = byId('quote-list');
  list.replaceChildren(...state.quotes.map(buildQuoteCard));
  state.quotes.forEach((_, i) => {
    refreshVehicleLine(i);
    refreshModelOptions(i);
  });
  byId<HTMLButtonElement>('add-quote').hidden = state.quotes.length >= MAX_QUOTES;
  byId('quote-cap').hidden = state.quotes.length < MAX_QUOTES;
}

function refreshVehicleLine(i: number): void {
  const out = document.getElementById(`q${i}-vehicle`);
  const q = state.quotes[i];
  if (!out || !q) return;
  const v = q.vehicle ? vehicleMap.get(q.vehicle) : undefined;
  if (!v) {
    setText(out, '');
    return;
  }
  const basis = state.basis === 'hwy' ? 'highway' : state.basis === 'city' ? 'city' : 'combined';
  const fuel = v.fuel === 'X' ? '' : ` This vehicle takes ${FUEL_NAMES[v.fuel]}, so type that fuel's price above.`;
  setText(out, `${vehicleLabel(v)}: ${basis} rating ${ratingOf(v, state.basis).toFixed(1)} L/100 km (Natural Resources Canada).${fuel}`);
}

function refreshModelOptions(i: number): void {
  const models = document.getElementById(`q${i}-models`) as HTMLSelectElement | null;
  if (!models) return;
  const cls = (document.getElementById(`q${i}-cls`) as HTMLSelectElement).value;
  const find = (document.getElementById(`q${i}-find`) as HTMLInputElement).value;
  const all = searchVehicles(vehicles, find, cls, 100_000);
  const shown = all.slice(0, 60);
  models.replaceChildren(...shown.map((v) => el('option', { value: vehicleKey(v), selected: v === vehicleMap.get(state.quotes[i]?.vehicle ?? '') }, `${vehicleLabel(v)} · ${ratingOf(v, state.basis).toFixed(1)}`)));
  setText(byId(`q${i}-count`), all.length > shown.length ? `Showing ${shown.length} of ${all.length}. Type more to narrow it down.` : `${all.length} ${all.length === 1 ? 'match' : 'matches'}.`);
}

function setL100(i: number, hundredths: number): void {
  const q = state.quotes[i];
  const box = document.getElementById(`q${i}-l100`) as HTMLInputElement | null;
  if (!q || !box) return;
  q.l100 = l100Text(hundredths);
  box.value = q.l100;
}

function applyVehicle(i: number, key: string): void {
  const v = vehicleMap.get(key);
  const q = state.quotes[i];
  if (!v || !q) return;
  q.vehicle = key;
  setL100(i, toHundredths(ratingOf(v, state.basis)));
  refreshVehicleLine(i);
}

function reapplyBasis(): void {
  state.quotes.forEach((q, i) => {
    if (q.vehicle && vehicleMap.has(q.vehicle)) applyVehicle(i, q.vehicle);
    refreshModelOptions(i);
  });
}

// ---------- painting the answer ----------

function lineRow(name: string, amount: string, detail?: string): HTMLElement {
  return el('div', { class: 'line' }, el('dt', {}, name), el('dd', {}, el('span', { class: 'amt' }, amount), detail ? el('span', { class: 'detail' }, detail) : null));
}

function paint(): void {
  const ev = evaluate(state, R);
  const { trip } = ev;

  // field errors
  for (const [key, id] of Object.entries(FIELD_IDS)) showProblem(id, trip.problems, key);
  ev.quotes.forEach((qr, i) => {
    for (const key of ['label', 'rate', 'days', 'fees', 'l100']) showProblem(`q${i}-${key}`, qr.problems, key);
    state.quotes[i]?.extras.forEach((_, n) => showProblem(`q${i}-extra${n}`, qr.problems, `extra${n}`));
  });

  setText(byId('km-line'), trip.km !== null ? `Round trip: ${kmText(trip.km)}` : '');
  setText(byId('pass-note'), trip.pass ? [`Park pass: ${trip.pass.basis}, ${dollars(trip.pass.cents)}.`, ...trip.pass.notes].join(' ') : '');

  paintHero(ev);
  paintMissing(ev);
  paintRanked(ev);
  paintUnpriced(ev);
  paintCompare(ev);
  byId('sample').hidden = state.sample;
}

function paintHero(ev: Evaluation): void {
  const hero = byId('hero');
  const top = ev.ranked[0];
  if (!top) {
    setIfChanged(hero, 'none', () => [el('p', { class: 'hero-kicker' }, 'No total yet'), el('p', { class: 'hero-idle' }, 'Fill in the trip and one quote, and the whole-trip cost shows up here.')]);
    return;
  }
  const n = ev.ranked.length;
  const tied = ev.ranked.filter((r) => r.rank === 1).length;
  const kicker = n === 1 ? 'The whole trip' : tied > 1 ? `Cheapest of ${n}: ${tied} tied` : `Cheapest of ${n}`;
  const sig = [kicker, top.label, top.totalCents, top.perDayCents, top.days].join('|');
  setIfChanged(hero, sig, () => [
    el('p', { class: 'hero-kicker' }, kicker),
    el('p', { class: 'hero-total' }, dollars(top.totalCents)),
    el('p', { class: 'hero-sub' }, `${top.label.trim() || 'Quote'} · ${top.days} ${top.days === 1 ? 'day' : 'days'} · ${dollars(top.perDayCents)} a day`),
  ]);
}

function paintMissing(ev: Evaluation): void {
  const out = byId('missing');
  const items: string[] = [];
  const tripProblems = Object.values(ev.trip.problems);
  const anyQuoteBlocked = ev.quotes.some((q) => !q.cost);
  if (anyQuoteBlocked) for (const p of tripProblems) items.push(`${p.blank ? 'Still needed' : 'Check'}: ${p.message}`);
  setIfChanged(out, items.join('\n'), () => items.map((t) => el('li', {}, t)));
}

function paintRanked(ev: Evaluation): void {
  const out = byId('ranked');
  const sig = JSON.stringify([ev.ranked, ev.trip.shared?.priceMills, ev.trip.km, ev.trip.pass?.basis, selectedRoute()?.kpass]);
  setIfChanged(out, sig, () =>
    ev.ranked.map((r) => {
      const idx = Number(r.id);
      const q = state.quotes[idx];
      const tiedWith = ev.ranked.filter((x) => x.rank === r.rank).length;
      const lines = el('dl', { class: 'lines' });
      const rateEach = q ? dollars(r.lines.rental / r.days) : '';
      lines.append(lineRow('Rental', dollars(r.lines.rental), `${rateEach} × ${r.days} ${r.days === 1 ? 'day' : 'days'}`));
      lines.append(lineRow('Fees and taxes', dollars(r.lines.fees), 'as quoted'));
      lines.append(
        lineRow('Fuel', dollars(r.lines.fuel), `${litresText(r.litres)} at ${pricePerLitreText(ev.trip.shared?.priceMills ?? 0)} over ${kmText(ev.trip.km ?? 0)}`),
      );
      lines.append(lineRow('Park pass', dollars(r.lines.pass), ev.trip.pass?.basis));
      if (selectedRoute()?.kpass) lines.append(lineRow('Kananaskis Conservation Pass', dollars(r.lines.kpass), 'per vehicle, per day'));
      for (const e of r.extras) lines.append(lineRow(e.label || 'Extra', dollars(e.cents), 'extra'));
      return el(
        'li',
        { class: 'rq' },
        el(
          'div',
          { class: 'rq-head' },
          el('span', { class: 'rank', 'aria-label': `Rank ${r.rank}` }, String(r.rank)),
          el('h3', {}, r.label.trim() || `Quote ${idx + 1}`),
          el('p', { class: 'rq-total' }, dollars(r.totalCents)),
        ),
        el('p', { class: 'rq-day' }, `${dollars(r.perDayCents)} a day over ${r.days} ${r.days === 1 ? 'day' : 'days'}${tiedWith > 1 ? ' · tied' : ''}`),
        lines,
      );
    }),
  );
}

function paintUnpriced(ev: Evaluation): void {
  const out = byId('unpriced');
  const rows = ev.quotes.filter((q) => !q.cost);
  const items = rows.map((qr) => {
    const own = Object.values(qr.problems).map((p) => p.message);
    const q = state.quotes[qr.index];
    return { name: q ? qLabel(q, qr.index) : '', text: own.length > 0 ? own.join(' ') : 'Waiting on the trip details.' };
  });
  setIfChanged(out, JSON.stringify(items), () =>
    items.length === 0 ? [] : [el('h3', { class: 'small-h' }, 'Not priced yet'), el('ul', { class: 'unpriced' }, ...items.map((it) => el('li', {}, el('strong', {}, `${it.name}: `), it.text)))],
  );
}

function paintCompare(ev: Evaluation): void {
  const box = byId('compare');
  const priced = ev.ranked;
  box.hidden = priced.length < 2;
  if (priced.length < 2) return;
  const a = byId<HTMLSelectElement>('cmp-a');
  const b = byId<HTMLSelectElement>('cmp-b');
  const ids = priced.map((p) => Number(p.id));
  const sig = JSON.stringify(priced.map((p) => [p.id, p.label]));
  if (a.dataset['sig'] !== sig) {
    a.dataset['sig'] = sig;
    b.dataset['sig'] = sig;
    const opts = () => priced.map((p) => el('option', { value: p.id }, p.label.trim() || `Quote ${Number(p.id) + 1}`));
    a.replaceChildren(...opts());
    b.replaceChildren(...opts());
    if (!ids.includes(state.cmpA)) state.cmpA = ids[0] ?? 0;
    if (!ids.includes(state.cmpB) || state.cmpB === state.cmpA) state.cmpB = ids.find((x) => x !== state.cmpA) ?? state.cmpA;
    a.value = String(state.cmpA);
    b.value = String(state.cmpB);
  }
  const qa = priced.find((p) => Number(p.id) === state.cmpA);
  const qb = priced.find((p) => Number(p.id) === state.cmpB);
  if (!qa || !qb) return;
  const c = compareQuotes(qa, qb);
  setText(byId('cmp-sentence'), c.sentence);
  setText(byId('cmp-h-a'), qa.label.trim() || 'First');
  setText(byId('cmp-h-b'), qb.label.trim() || 'Second');
  const names = { rental: 'Rental', fees: 'Fees and taxes', fuel: 'Fuel', extras: 'Winter extras' } as const;
  byId('cmp-body').replaceChildren(
    ...(Object.keys(names) as (keyof typeof names)[]).map((k) =>
      el('tr', {}, el('th', { scope: 'row' }, names[k]), el('td', {}, dollars(qa.lines[k])), el('td', {}, dollars(qb.lines[k])), el('td', {}, c.deltas[k] === 0 ? 'same' : `${c.deltas[k] > 0 ? '+' : '−'}${dollars(Math.abs(c.deltas[k]))}`)),
    ),
    el('tr', { class: 'total' }, el('th', { scope: 'row' }, 'Whole trip'), el('td', {}, dollars(qa.totalCents)), el('td', {}, dollars(qb.totalCents)), el('td', {}, c.totalDelta === 0 ? 'same' : `${c.totalDelta > 0 ? '+' : '−'}${dollars(Math.abs(c.totalDelta))}`)),
  );
}

// ---------- the "where from" section ----------

function paintSources(provenance: ProvenanceFile): void {
  setText(byId('checked-on'), ref.checkedOn);
  byId('ref-sources').replaceChildren(
    ...ref.sources.map((s) =>
      el('li', {}, link(s.url, s.title), ` — ${s.used}. ${s.terms} Checked ${s.checkedOn}${s.pageDate ? `, page dated ${s.pageDate}` : ''}.`),
    ),
    el('li', {}, link(ref.kpass.source, 'Kananaskis Conservation Pass'), ' — see above.'),
  );
  const data = byId('data-sources');
  if (provenance.sources.length > 0) {
    data.replaceChildren(
      ...provenance.sources.map((s) =>
        el(
          'li',
          {},
          link(s.sourceUrl, s.title),
          ` — ${s.publisher}. Licence: `,
          link(s.licenceUrl, s.licence),
          `. File dated ${s.fileDate ?? 'not stated by the publisher'}; fetched ${s.fetchedOn}. ${s.rowsKept} listings kept, ${s.rowsLeftOut} left out as unusable.`,
        ),
      ),
    );
  } else {
    data.replaceChildren(
      ...SOURCES.map((s) =>
        el('li', {}, link(s.landingUrl, s.title), ` — ${s.publisher}. Licence: `, link(s.licenceUrl, s.licence), '. Not downloaded yet. The monthly job adds the ratings and this line shows the date it read them.'),
      ),
    );
  }
  byId('route-sources').replaceChildren(
    ...ref.routes.map((r) =>
      el('li', {}, el('strong', {}, `${r.label}: `), r.oneWayKm === null ? 'type your own. ' : `${r.oneWayKm} km one way. `, r.basis, ' ', ...r.sourceUrls.flatMap((u, i) => [i > 0 ? ' ' : '', link(u, `[source ${i + 1}]`)])),
    ),
  );
  const first = provenance.sources[0] ?? SOURCES[0];
  setText(byId('attribution'), `${first ? first.attribution : 'Contains information licensed under the Open Government Licence – Canada.'} Park and route figures are facts copied by hand; Parks Canada's web wording is summarised, not reproduced.`);
}

// ---------- data loading ----------

interface ProvenanceFile {
  sources: { title: string; publisher: string; sourceUrl: string; licence: string; licenceUrl: string; attribution: string; fileDate: string | null; fetchedOn: string; rowsKept: number; rowsLeftOut: number }[];
}

async function loadJson(path: string): Promise<unknown> {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return res.json();
}

function isProvenance(v: unknown): v is ProvenanceFile {
  return typeof v === 'object' && v !== null && Array.isArray((v as { sources?: unknown }).sources);
}

async function loadData(): Promise<void> {
  let provenance: ProvenanceFile = { sources: [] };
  try {
    const raw = (await loadJson('./data/vehicles.json')) as { vehicles?: unknown };
    const list = Array.isArray(raw.vehicles) ? raw.vehicles.filter(isVehicle) : [];
    vehicles = list;
    vehicleMap = new Map(list.map((v) => [vehicleKey(v), v]));
    vehicleStatus = list.length > 0 ? 'ready' : 'empty';
  } catch {
    vehicleStatus = 'failed';
  }
  try {
    const p = await loadJson('./data/provenance.json');
    if (isProvenance(p)) provenance = { sources: p.sources.filter((s) => typeof s === 'object' && s !== null) };
  } catch {
    /* the section falls back to the list of sources the job reads */
  }
  paintSources(provenance);
  const first = provenance.sources[0];
  provenanceLine = first ? `${vehicles.length} listings from ${first.title}. File dated ${first.fileDate ?? 'not stated'}, fetched ${first.fetchedOn}.` : `${vehicles.length} listings.`;
  setText(
    byId('vehicle-status'),
    vehicleStatus === 'ready'
      ? provenanceLine
      : vehicleStatus === 'empty'
        ? 'No vehicle ratings are bundled yet. The monthly data job fills them in. Until then, type the fuel use in L/100 km from the rental listing or the vehicle’s fuel label.'
        : 'The vehicle ratings could not be loaded. Type the fuel use in L/100 km yourself.',
  );
  syncVisibility();
  renderQuotes();
  paint();
}

// ---------- events ----------

let hashTimer: number | undefined;
function writeHash(): void {
  window.clearTimeout(hashTimer);
  if (state.sample) return;
  try {
    history.replaceState(null, '', `${location.pathname}${location.search}#${encodeState(state)}`);
  } catch {
    /* some embeds forbid it; sharing still works through the copy button */
  }
}

function touched(): void {
  if (state.sample) {
    state.sample = false;
    byId('sample-note').hidden = true;
  }
  paint();
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(writeHash, 250);
}

function setBound(key: string, value: string): void {
  switch (key) {
    case 'passMode':
      state.passMode = value as FormState['passMode'];
      break;
    case 'basis':
      state.basis = value as FormState['basis'];
      break;
    default:
      (state as unknown as Record<string, unknown>)[key] = value;
  }
}

function onTripInput(e: Event): void {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.id === 'route') {
    state.routeId = t.value;
    syncVisibility();
    touched();
    return;
  }
  const bind = t.dataset['bind'];
  if (!bind) return;
  setBound(bind, t.value);
  if (bind === 'passMode') syncVisibility();
  if (bind === 'basis') reapplyBasis();
  touched();
}

function onQuoteInput(e: Event): void {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  const qi = Number(t.dataset['q']);
  const q = state.quotes[qi];
  if (!q) return;
  if (t.dataset['pick']) {
    const pick = t.dataset['pick'];
    if (pick === 'model') {
      applyVehicle(qi, t.value);
      touched();
    } else {
      refreshModelOptions(qi);
    }
    return;
  }
  const extra = t.dataset['extra'];
  if (extra !== undefined) {
    const row = q.extras[Number(extra)];
    if (row) row[t.dataset['ebind'] === 'label' ? 'label' : 'amount'] = t.value;
    touched();
    return;
  }
  const bind = t.dataset['bind'];
  if (bind === 'label' || bind === 'rate' || bind === 'days' || bind === 'fees' || bind === 'l100') {
    q[bind] = t.value;
    if (bind === 'l100' && q.vehicle) {
      q.vehicle = '';
      refreshVehicleLine(qi);
    }
    touched();
  }
}

function onClick(e: Event): void {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!t) return;
  const action = t.dataset['action'];
  const qi = Number(t.dataset['q']);
  if (action === 'remove-quote' && state.quotes.length > 1) {
    state.quotes.splice(qi, 1);
    openPickers.clear();
    state.cmpA = 0;
    state.cmpB = 1;
    renderQuotes();
    touched();
  } else if (action === 'add-extra') {
    const q = state.quotes[qi];
    if (q && q.extras.length < MAX_EXTRAS) {
      q.extras.push({ label: '', amount: '' });
      rememberPickers();
      renderQuotes();
      (document.getElementById(`q${qi}-extra${q.extras.length - 1}-label`) as HTMLInputElement | null)?.focus();
      touched();
    }
  } else if (action === 'remove-extra') {
    const q = state.quotes[qi];
    q?.extras.splice(Number(t.dataset['extra']), 1);
    rememberPickers();
    renderQuotes();
    touched();
  } else if (action === 'class-average') {
    const cls = (document.getElementById(`q${qi}-cls`) as HTMLSelectElement).value;
    const avg = cls === '' ? null : classAverage(vehicles, cls, state.basis);
    const out = document.getElementById(`q${qi}-vehicle`);
    if (!avg || !out) {
      if (out) setText(out, 'Pick a class first.');
      return;
    }
    const q = state.quotes[qi];
    if (q) q.vehicle = '';
    setL100(qi, avg.hundredths);
    setText(out, `Average ${state.basis === 'hwy' ? 'highway' : state.basis === 'city' ? 'city' : 'combined'} rating of ${avg.count} ${cls} listings: ${l100Text(avg.hundredths)} L/100 km. Worked out from the ratings file, not published by Natural Resources Canada.`);
    touched();
  }
}

function rememberPickers(): void {
  openPickers.clear();
  document.querySelectorAll<HTMLDetailsElement>('details.picker[open]').forEach((d) => openPickers.add(Number(d.dataset['q'])));
}

async function copyLink(): Promise<void> {
  writeHash();
  const url = state.sample ? `${location.origin}${location.pathname}#${encodeState({ ...state, sample: false })}` : location.href;
  const toast = byId('toast');
  const fallback = byId<HTMLTextAreaElement>('copy-fallback');
  try {
    await navigator.clipboard.writeText(url);
    fallback.hidden = true;
    setText(toast, 'Link copied.');
  } catch {
    // Older phones and locked-down embeds refuse to copy. Show the link so it can be copied by hand.
    fallback.value = url;
    fallback.hidden = false;
    fallback.select();
    setText(toast, 'Copy the link below.');
  }
  window.setTimeout(() => setText(toast, ''), 3500);
}

function setSampleNote(): void {
  const n = byId('sample-note');
  n.hidden = !state.sample;
  if (state.sample) n.textContent = 'These numbers are a sample I made up to show how it works: two invented quotes and a made-up fuel price. They are not real quotes or prices. Replace them with yours, or press Clear everything.';
}

function loadState(next: FormState): void {
  state = next;
  openPickers.clear();
  fillTripForm();
  renderQuotes();
  setSampleNote();
  paint();
}

function init(): void {
  const hash = location.hash;
  const fromLink = hash.startsWith('#s=') ? decodeState(hash) : null;
  if (hash.startsWith('#s=') && !fromLink) {
    const n = byId('link-note');
    n.hidden = false;
    n.textContent = 'That link could not be read, so you are seeing the sample instead.';
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* ignore */
    }
  }
  state = fromLink ?? sampleState();

  byId('winter-text').textContent = ref.winterRules.map((w) => w.text).join(' ');
  fillTripForm();
  renderQuotes();
  setSampleNote();
  paintSources({ sources: [] });
  setText(byId('vehicle-status'), 'Loading the vehicle ratings…');
  paint();

  byId('trip').addEventListener('input', onTripInput);
  byId('trip').addEventListener('change', onTripInput);
  const list = byId('quote-list');
  list.addEventListener('input', onQuoteInput);
  list.addEventListener('change', onQuoteInput);
  list.addEventListener('click', onClick);
  byId('add-quote').addEventListener('click', () => {
    if (state.quotes.length >= MAX_QUOTES) return;
    state.quotes.push(blankQuote(state.quotes.length + 1));
    rememberPickers();
    renderQuotes();
    (document.getElementById(`q${state.quotes.length - 1}-label`) as HTMLInputElement | null)?.focus();
    touched();
  });
  byId('cmp-a').addEventListener('change', (e) => {
    state.cmpA = Number((e.target as HTMLSelectElement).value);
    byId<HTMLSelectElement>('cmp-a').dataset['sig'] = '';
    touched();
  });
  byId('cmp-b').addEventListener('change', (e) => {
    state.cmpB = Number((e.target as HTMLSelectElement).value);
    byId<HTMLSelectElement>('cmp-b').dataset['sig'] = '';
    touched();
  });
  byId('copy-link').addEventListener('click', () => void copyLink());
  byId('clear').addEventListener('click', () => {
    loadState(emptyState());
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* ignore */
    }
    byId('link-note').hidden = true;
    byId<HTMLInputElement>('fuelprice').focus();
  });
  byId('sample').addEventListener('click', () => {
    loadState(sampleState());
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* ignore */
    }
  });

  void loadData();

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is a bonus; the calculator works without it */
    });
  }
}

init();
