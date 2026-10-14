/**
 * The monthly data job.
 *
 *   fetch  -> parse -> validate -> write public/data/vehicles.json and public/data/provenance.json
 *
 * Nothing is written until every source has passed every check. On any failure the job exits non-zero and the
 * files already in the repo stay exactly as they were, so the site keeps serving the last good numbers.
 *
 * Run it: `npm run data:refresh`
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVehicle, type Vehicle } from '../src/core/vehicles';
import { parseRatings, RatingsFileError } from './ratings';
import { SOURCES, type Source } from './sources';
import { LIMITS, validate, type Limits } from './validate';

export interface ProvenanceEntry {
  id: string;
  title: string;
  publisher: string;
  sourceUrl: string;
  licence: string;
  licenceUrl: string;
  attribution: string;
  /** The date the publisher says the file was last changed (HTTP Last-Modified), or null if it did not say. */
  fileDate: string | null;
  /** The day this job read the file. */
  fetchedOn: string;
  rowsRead: number;
  rowsKept: number;
  rowsLeftOut: number;
  duplicatesDropped: number;
}

export interface Options {
  sources?: Source[];
  outDir: string;
  today: string;
  fetchFn?: typeof fetch;
  limits?: Limits;
}

export interface Outcome {
  ok: boolean;
  errors: string[];
  vehicles: number;
}

const MAX_BYTES = 20 * 1024 * 1024;

async function readPrevious(outDir: string): Promise<Vehicle[] | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(outDir, 'vehicles.json'), 'utf8'));
    const list = (parsed as { vehicles?: unknown }).vehicles;
    return Array.isArray(list) ? list.filter(isVehicle) : null;
  } catch {
    return null;
  }
}

async function download(url: string, fetchFn: typeof fetch): Promise<{ text: string; lastModified: string | null }> {
  const res = await fetchFn(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
    headers: { 'user-agent': 'banff-trip-cost-data-job (+https://github.com/daksh2197/banff-trip-cost)' },
  });
  if (!res.ok) throw new Error(`${url} answered ${res.status}.`);
  const type = res.headers.get('content-type') ?? '';
  if (/html/i.test(type)) throw new Error(`${url} sent a web page (${type}), not a CSV.`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`${url} is bigger than ${MAX_BYTES / 1024 / 1024} MB.`);
  const lm = res.headers.get('last-modified');
  const d = lm ? new Date(lm) : null;
  return { text, lastModified: d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null };
}

function sortVehicles(list: Vehicle[]): Vehicle[] {
  return [...list].sort(
    (a, b) =>
      b.year - a.year ||
      a.make.localeCompare(b.make) ||
      a.model.localeCompare(b.model) ||
      (a.engineL ?? 0) - (b.engineL ?? 0) ||
      a.trans.localeCompare(b.trans) ||
      a.fuel.localeCompare(b.fuel),
  );
}

async function writeAtomic(path: string, body: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, body, 'utf8');
  await rename(tmp, path);
}

export async function refresh(opts: Options): Promise<Outcome> {
  const sources = opts.sources ?? SOURCES;
  const fetchFn = opts.fetchFn ?? fetch;
  const limits = opts.limits ?? LIMITS;
  const errors: string[] = [];
  const previous = await readPrevious(opts.outDir);
  const all: Vehicle[] = [];
  const entries: ProvenanceEntry[] = [];

  for (const s of sources) {
    try {
      const { text, lastModified } = await download(s.downloadUrl, fetchFn);
      const parsed = parseRatings(text, { min: s.year, max: s.year });
      const problems = validate(parsed, s.year, previous, limits);
      if (problems.length > 0) {
        errors.push(...problems.map((p) => `${s.id}: ${p}`));
        continue;
      }
      all.push(...parsed.vehicles);
      entries.push({
        id: s.id,
        title: s.title,
        publisher: s.publisher,
        sourceUrl: s.landingUrl,
        licence: s.licence,
        licenceUrl: s.licenceUrl,
        attribution: s.attribution,
        fileDate: lastModified,
        fetchedOn: opts.today,
        rowsRead: parsed.rows,
        rowsKept: parsed.vehicles.length,
        rowsLeftOut: parsed.rejected.length,
        duplicatesDropped: parsed.duplicates,
      });
    } catch (e) {
      errors.push(`${s.id}: ${e instanceof RatingsFileError || e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors, vehicles: 0 };

  const sorted = sortVehicles(all);
  // One vehicle per line, so a monthly change reads as a real diff.
  const vehiclesJson = `{"vehicles":[\n${sorted.map((v) => JSON.stringify(v)).join(',\n')}\n]}\n`;
  const provenanceJson = `${JSON.stringify({ sources: entries }, null, 2)}\n`;

  await mkdir(opts.outDir, { recursive: true });
  await writeAtomic(join(opts.outDir, 'vehicles.json'), vehiclesJson);
  await writeAtomic(join(opts.outDir, 'provenance.json'), provenanceJson);
  return { ok: true, errors: [], vehicles: sorted.length };
}

// Run from the command line, not when imported by a test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outDir = fileURLToPath(new URL('../public/data/', import.meta.url));
  const today = new Date().toISOString().slice(0, 10);
  refresh({ outDir, today }).then(
    (r) => {
      if (!r.ok) {
        console.error('Data refresh failed. The data in the repo was not changed.');
        for (const e of r.errors) console.error(` - ${e}`);
        process.exit(1);
      }
      console.log(`Data refresh ok: ${r.vehicles} vehicles written to ${outDir}`);
    },
    (e) => {
      console.error('Data refresh crashed:', e);
      process.exit(1);
    },
  );
}
