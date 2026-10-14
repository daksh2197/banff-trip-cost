import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isVehicle } from '../src/core/vehicles';
import { parseCsv } from './csv';
import { parseRatings, RatingsFileError, readDecimal } from './ratings';
import { refresh } from './run';
import type { Source } from './sources';
import { HEADER, makeCsv } from './testkit';
import { validate, type Limits } from './validate';

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const YEAR = { min: 2026, max: 2026 };

describe('the CSV reader', () => {
  it('reads quoted commas, doubled quotes, line breaks inside quotes, CRLF and a BOM', () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n"two\nlines",,\r\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['two\nlines', '', ''],
    ]);
  });

  it('skips blank lines and copes with no final newline', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('')).toEqual([]);
  });

  it('fails loudly on a quote that never closes', () => {
    expect(() => parseCsv('a,b\n"oops,1\n')).toThrow(/quoted field/);
  });
});

describe('reading a rating', () => {
  it('takes a dot or a comma as the decimal mark and nothing else', () => {
    expect(readDecimal('8.5')).toBe(8.5);
    expect(readDecimal('8,5')).toBe(8.5);
    expect(readDecimal(' 9 ')).toBe(9);
    for (const t of ['', '-', 'n/a', '1,234.5', '8.5.1', '1e3', 'NaN', undefined]) expect(readDecimal(t), String(t)).toBeNull();
  });
});

describe('the ratings file', () => {
  it('reads the good fixture: BOM, CRLF, quoted comma and quote, decimal comma', async () => {
    const r = parseRatings(await fixture('sample-good.csv'), YEAR);
    expect(r.rows).toBe(4);
    expect(r.rejected).toEqual([]);
    expect(r.vehicles.map((v) => v.model)).toEqual(['Alpha', 'Alpha "Sport", 2.0T', 'Big Hauler', 'Diesel Dan']);
    expect(r.vehicles[1]).toMatchObject({ fuel: 'Z', engineL: 2, cyl: 4, trans: 'AS8', city: 10.6, hwy: 7.1, comb: 8.9 });
    expect(r.vehicles[2]).toMatchObject({ city: 16, cls: 'Pickup truck: Standard' });
    expect(r.vehicles[3]!.fuel).toBe('D');
    expect(r.vehicles.every(isVehicle)).toBe(true);
  });

  it('leaves out each bad row with its reason and keeps the good ones', async () => {
    const r = parseRatings(await fixture('sample-bad-rows.csv'), YEAR);
    expect(r.rows).toBe(11);
    expect(r.vehicles.map((v) => v.model)).toEqual(['Fine One', 'Second Fine']);
    expect(r.duplicates).toBe(1);
    expect(r.rejected.map((x) => x.line)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.rejected[0]!.reason).toMatch(/blank or not a number/);
    expect(r.rejected[1]!.reason).toMatch(/blank or not a number/);
    expect(r.rejected[2]!.reason).toMatch(/outside 1 to 30/);
    expect(r.rejected[3]!.reason).toMatch(/outside 1 to 30/);
    expect(r.rejected[4]!.reason).toMatch(/fuel type "B"/);
    expect(r.rejected[5]!.reason).toMatch(/fuel type "Q"/);
    expect(r.rejected[6]!.reason).toMatch(/model year "2019"/);
    expect(r.rejected[7]!.reason).toMatch(/make or model is blank/);
  });

  it('stops on a missing column and names it', async () => {
    expect(() => parseRatings('x', YEAR)).toThrow(RatingsFileError);
    expect(() => parseRatings(HEADER, YEAR)).toThrow(/no data rows/);
    const run = async () => parseRatings(await fixture('sample-missing-column.csv'), YEAR);
    await expect(run()).rejects.toThrow(/Missing columns: highwayl100km/);
  });

  it('reads columns in any order and ignores extra ones', async () => {
    const r = parseRatings(await fixture('sample-extra-column.csv'), YEAR);
    expect(r.vehicles).toHaveLength(1);
    expect(r.vehicles[0]).toMatchObject({ make: 'Samplecar', engineL: null, cyl: null, trans: '', comb: 7.9 });
  });

  it('stops on an electric-vehicle file, which has no L/100 km columns', async () => {
    const run = async () => parseRatings(await fixture('sample-ev.csv'), YEAR);
    await expect(run()).rejects.toThrow(/Missing columns/);
  });

  it('stops on an HTML error page saved as a CSV', async () => {
    const run = async () => parseRatings(await fixture('sample-error-page.csv'), YEAR);
    await expect(run()).rejects.toThrow(/web page, not a CSV/);
  });

  it('drops an exact duplicate but keeps two engines of one model', () => {
    const two = makeCsv(0).trimEnd() + '\n2026,Samplecar,Twin,Compact,1.5,4,A8,X,9,6,7.5,30,190,6,6\n2026,Samplecar,Twin,Compact,2.0,4,A8,X,10,7,8.5,30,190,6,6\n2026,Samplecar,Twin,Compact,2.0,4,A8,X,10,7,8.5,30,190,6,6\n';
    const r = parseRatings(two, YEAR);
    expect(r.vehicles).toHaveLength(2);
    expect(r.duplicates).toBe(1);
  });

  it('accepts the header in any case and spacing', () => {
    const csv = 'MODEL YEAR,make,MODEL,vehicle class,fuel type,city (l/100km),HIGHWAY (L/100 km),combined (l/100 km)\n2026,A,B,C,X,9,7,8\n';
    expect(parseRatings(csv, YEAR).vehicles).toHaveLength(1);
  });
});

describe('the gate', () => {
  const limits: Limits = { minRows: 5, maxRejectedShare: 0.1, minShareOfPrevious: 0.7 };
  const good = parseRatings(makeCsv(20), YEAR);

  it('passes a healthy file', () => {
    expect(validate(good, 2026, null, limits)).toEqual([]);
  });

  it('fails a file that is too small', () => {
    expect(validate(parseRatings(makeCsv(3), YEAR), 2026, null, limits)[0]).toMatch(/Only 3 usable rows/);
  });

  it('fails a file where too many rows are bad, and quotes the first one', () => {
    const bad = makeCsv(18, 2026, ['2026,A,B,C,1,4,A,X,0.1,0.1,0.1', '2026,A,C,C,1,4,A,X,0.1,0.1,0.1', '2026,A,D,C,1,4,A,X,0.1,0.1,0.1']);
    const errs = validate(parseRatings(bad, YEAR), 2026, null, limits);
    expect(errs.join()).toMatch(/3 of 21 rows were bad/);
    expect(errs.join()).toMatch(/line 20/);
  });

  it('fails when the wanted model year is missing', () => {
    expect(validate(good, 2027, null, limits).join()).toMatch(/No rows for model year 2027/);
  });

  it('fails when the file shrank sharply against the data already in the repo', () => {
    const before = parseRatings(makeCsv(100), YEAR).vehicles;
    const errs = validate(good, 2026, before, limits);
    expect(errs.join()).toMatch(/shrank from 100 to 20/);
    expect(validate(parseRatings(makeCsv(80), YEAR), 2026, before, limits)).toEqual([]);
  });
});

describe('the job, against a local server that behaves like the portal', () => {
  let server: Server;
  let base = '';
  let body = makeCsv(250);
  let mode: 'ok' | 'html' | 'error' | 'redirect-html' = 'ok';

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/portal/file.csv') {
        // like open.canada.ca: the portal link answers with a redirect to a temporary address
        res.writeHead(302, { location: `${base}/signed/abc123.csv` }).end();
      } else if (req.url === '/signed/abc123.csv') {
        if (mode === 'error') return void res.writeHead(500).end('boom');
        if (mode === 'html') return void res.writeHead(200, { 'content-type': 'text/html' }).end('<html>maintenance</html>');
        res.writeHead(200, { 'content-type': 'text/csv', 'last-modified': 'Tue, 06 Oct 2026 14:00:00 GMT' }).end(body);
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });
  afterAll(() => void server.close());

  const source = (): Source => ({
    id: 'test-source',
    title: 'Test ratings, invented',
    publisher: 'Nobody',
    landingUrl: `${base}/dataset`,
    downloadUrl: `${base}/portal/file.csv`,
    year: 2026,
    licence: 'Test licence',
    licenceUrl: `${base}/licence`,
    attribution: 'Invented.',
  });

  const run = async (dir: string) => refresh({ sources: [source()], outDir: dir, today: '2026-10-14' });
  const tmp = () => mkdtemp(join(tmpdir(), 'btc-'));

  it('follows the redirect, validates, and writes vehicles.json and provenance.json', async () => {
    mode = 'ok';
    body = makeCsv(250);
    const dir = await tmp();
    const out = await run(dir);
    expect(out).toEqual({ ok: true, errors: [], vehicles: 250 });

    const vehicles = JSON.parse(await readFile(join(dir, 'vehicles.json'), 'utf8')) as { vehicles: unknown[] };
    expect(vehicles.vehicles).toHaveLength(250);
    expect(vehicles.vehicles.every(isVehicle)).toBe(true);

    const prov = JSON.parse(await readFile(join(dir, 'provenance.json'), 'utf8')) as { sources: Record<string, unknown>[] };
    expect(prov.sources).toHaveLength(1);
    expect(prov.sources[0]).toMatchObject({
      id: 'test-source',
      sourceUrl: `${base}/dataset`,
      licence: 'Test licence',
      licenceUrl: `${base}/licence`,
      fileDate: '2026-10-06',
      fetchedOn: '2026-10-14',
      rowsRead: 250,
      rowsKept: 250,
      rowsLeftOut: 0,
    });
    expect(JSON.stringify(prov)).not.toContain('signed/abc123');
    expect((await readdir(dir)).sort()).toEqual(['provenance.json', 'vehicles.json']);
  });

  it('writes the same bytes twice for the same input', async () => {
    mode = 'ok';
    body = makeCsv(250);
    const dir = await tmp();
    await run(dir);
    const first = await readFile(join(dir, 'vehicles.json'), 'utf8');
    await run(dir);
    expect(await readFile(join(dir, 'vehicles.json'), 'utf8')).toBe(first);
  });

  it('keeps the old data and reports failure when the server errors, sends a web page, or the file is too small', async () => {
    mode = 'ok';
    body = makeCsv(250);
    const dir = await tmp();
    await run(dir);
    const before = await readFile(join(dir, 'vehicles.json'), 'utf8');
    const provBefore = await readFile(join(dir, 'provenance.json'), 'utf8');

    mode = 'error';
    const a = await run(dir);
    expect(a.ok).toBe(false);
    expect(a.errors.join()).toMatch(/answered 500/);

    mode = 'html';
    const b = await run(dir);
    expect(b.ok).toBe(false);
    expect(b.errors.join()).toMatch(/web page/);

    mode = 'ok';
    body = makeCsv(30);
    const c = await run(dir);
    expect(c.ok).toBe(false);
    expect(c.errors.join()).toMatch(/Only 30 usable rows/);

    body = makeCsv(250).replace(HEADER, HEADER.replace('Highway (L/100 km)', 'Highway'));
    const d = await run(dir);
    expect(d.ok).toBe(false);
    expect(d.errors.join()).toMatch(/Missing columns/);

    expect(await readFile(join(dir, 'vehicles.json'), 'utf8')).toBe(before);
    expect(await readFile(join(dir, 'provenance.json'), 'utf8')).toBe(provBefore);
  });

  it('refuses a file that shrank to a third of the data already there', async () => {
    mode = 'ok';
    body = makeCsv(400);
    const dir = await tmp();
    await run(dir);
    body = makeCsv(250);
    const r = await run(dir);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/shrank from 400 to 250/);
  });

  it('writes nothing at all when a first-time run fails', async () => {
    mode = 'error';
    const dir = await tmp();
    const r = await run(dir);
    expect(r.ok).toBe(false);
    expect(await readdir(dir)).toEqual([]);
  });

  it('survives a corrupt old vehicles.json', async () => {
    mode = 'ok';
    body = makeCsv(250);
    const dir = await tmp();
    await writeFile(join(dir, 'vehicles.json'), '{not json');
    expect((await run(dir)).ok).toBe(true);
  });
});
