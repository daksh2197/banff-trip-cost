# The pipeline

This is the one idea this repo adds on top of the Mol-Bhav Meter pattern: **an open-data pipeline**. A script fetches public data on a timer, checks it hard, and commits a small file the site reads. Nobody touches the fuel ratings by hand, and a bad download cannot reach the site. The park prices and distances are still typed in by hand, with their dates, in `src/data/reference.json`.

The code is in [`pipeline/`](../pipeline/). It reads in the same order as this page.

## 1. The shape

```
 .github/workflows/refresh-data.yml   (monthly timer, or press "Run workflow")
        |
        v
 pipeline/run.ts      fetch -> parse -> validate -> write
        |                |        |         |
        |         ratings.ts  validate.ts   public/data/vehicles.json
        |         csv.ts                    public/data/provenance.json
        v
 npm test, npm run build   (against the new data)
        |
        v
 commit to main, then start ship.yml (test and deploy)
```

Three rules hold the whole thing up:

1. **Nothing is written until everything passes.** `refresh()` collects every file's result first and only then writes. A failure returns before any file is touched, and the job exits non-zero. A test checks the old bytes are still there after four different kinds of failure.
2. **Writes are atomic.** Each file is written to `name.json.tmp` and renamed, so a crash cannot leave half a file.
3. **The site and the job share one definition of "a good vehicle".** `isVehicle()` and the rating limits live in [`src/core/vehicles.ts`](../src/core/vehicles.ts). The job builds rows that pass it. The page filters what it loads through it. A file the page would choke on cannot get committed.

## 2. The source

Natural Resources Canada publishes Fuel Consumption Ratings on the Open Government portal, one CSV per model year, English and French. The licence is the Open Government Licence – Canada, which allows this use with the attribution line the page and README carry.

What the prep research for this build found, all on 2026-10-13 and none of it re-checked by me:

| Fact | Value |
| --- | --- |
| Dataset | `98f1a129-f628-4ce4-b24d-6f16bf24dd64` |
| Model year 2026 file | 53,702 bytes, dated 2026-10-06 |
| Columns (15) | Model year, Make, Model, Vehicle class, Engine size (L), Cylinders, Transmission, Fuel type, City (L/100 km), Highway (L/100 km), Combined (L/100 km), Combined (mpg), CO2 emissions (g/km), CO2 rating, Smog rating |
| Combined means | 55% city plus 45% highway, from unrounded values |
| Fuel codes | X regular, Z premium, D diesel, E E85 (B electricity and N natural gas also exist) |
| Download links | answer with a redirect to a temporary signed address that expires the same day |

The redirect is why `download()` in `run.ts` follows redirects and why `provenance.json` records the portal's own page, never the temporary address. A test serves a `302` to a second URL and checks the temporary address never appears in the output.

`pipeline/sources.ts` holds one entry for model year 2026. I left out electric and plug-in files (their own files, kWh units), and the 1995 to 2014 files (adjusted values, not tested ones).

## 3. Reading the file: `csv.ts` and `ratings.ts`

`csv.ts` is a small reader that handles what real exports do: a byte-order mark, CRLF line endings, quoted fields with commas in them (`"Alpha ""Sport"", 2.0T"`), line breaks inside quotes, blank lines. A quote that never closes is an error.

`ratings.ts` matches columns by name with case, spaces and punctuation removed, so `City (L/100 km)` and `city l/100km` are the same column. It trusts nothing else. The eight required columns must all be there or the whole file is refused with the column names it found. Then each row is judged alone:

| A row is left out when | Reason recorded |
| --- | --- |
| the model year is not the one asked for | `model year "2019" is outside 2026 to 2026` |
| make or model is blank | `make or model is blank` |
| the fuel code is not X, Z, D or E | `fuel type "B" is not one of X, Z, D, E` |
| a rating is blank, a dash, or not a number | `a rating is blank or not a number` |
| a rating is outside 1 to 30 L/100 km | `rating 99 L/100 km is outside 1 to 30` |

Two softer rules: an exact duplicate row is dropped and counted, and two engines of one model both stay, because they are different rows. A rating written with a decimal comma (`16,0`) is read as 16.0, because the French file may use one. A rating written `1,234.5` is refused.

A file that starts with `<!doctype`, `<html` or similar is refused before parsing: an error page saved as a CSV is the quietest way to corrupt a dataset.

## 4. The gate: `validate.ts`

A file with a few bad rows is normal. A file with many is not to be trusted. These limits are the whole policy:

| Check | Limit | Why |
| --- | --- | --- |
| Usable rows | at least 200 | A model year has many hundreds of listings. 53,702 bytes at roughly 90 bytes a row is about 600. 200 is my own floor; no source publishes one |
| Rows left out | at most 5% of rows read | One bad row is a typo. A tenth of the file is a format change |
| The year is present | at least one row for the year asked for | Catches a file for the wrong year |
| Shrinkage | the new count for the year is at least 70% of the count already in the repo | A truncated download looks valid row by row |

When a check fails the error says which one, with the numbers, and quotes the first bad row's line. Open the failed run's log and the first line tells you what to look at.

## 5. What gets written

`public/data/vehicles.json` holds one vehicle per line, sorted, so a monthly change is a readable diff. `public/data/provenance.json` records, for each file read:

| Field | Meaning |
| --- | --- |
| `sourceUrl` | The dataset page on the portal |
| `licence`, `licenceUrl`, `attribution` | What the page prints |
| `fileDate` | The date the server said the file last changed (the `Last-Modified` header), or `null` if it did not say |
| `fetchedOn` | The day the job read it |
| `rowsRead`, `rowsKept`, `rowsLeftOut`, `duplicatesDropped` | The counts, so a drift is visible |

The page builds its "Where the numbers come from" section from this file. If it is empty the page says the ratings have not been downloaded yet.

Writing the same input twice produces identical bytes in `vehicles.json`, so a month where the ratings did not change shows as a one-line change to `fetchedOn` in `provenance.json` and nothing else. That small commit is on purpose: it is the record that the job ran and the data was checked.

## 6. The timer and the deploy

`refresh-data.yml` runs on the 8th of each month at 09:17 UTC and on demand. It runs only in `daksh2197/banff-trip-cost`, so a fork does not run a job on a timer. After the data job it runs `npm test` and `npm run build` against the new data, then commits `public/data` if anything changed (the `fetchedOn` date means something does, every month).

One thing catches people out. A push made with the workflow's built-in token does **not** start other workflows. GitHub does that on purpose, to stop loops. So the last step runs `gh workflow run ship.yml --ref main`, which `ship.yml` allows through `workflow_dispatch`, and that runs the tests and deploys.

## 7. What is tested, and what is not

Tested, in [`pipeline/pipeline.test.ts`](../pipeline/pipeline.test.ts):

- The CSV reader on quotes, doubled quotes, line breaks in quotes, CRLF, BOM, blank lines, an unclosed quote.
- The ratings reader on invented fixtures: BOM and CRLF, quoted commas, a decimal comma, a blank rating, a dash, ratings of 0.2 and 99, an electric row, an unknown fuel code, a wrong year, a blank make, a duplicate, a missing column, an extra and shuffled columns, an electric-vehicle file, an HTML error page.
- The gate: too few rows, too many bad rows, the wrong year, a file that shrank.
- The whole job against a local server that redirects like the portal: success with provenance, byte-identical output on a repeat, and the old files left untouched after a server error, a web page, a file that is too small, and a missing column; a first-run failure that writes nothing; a corrupt old file.

Not tested, because I could not:

- **The real file.** The machine that built this could not reach open.canada.ca. The column names come from the published list on the dataset page. If the real header differs, the job fails with the names it found, and the old data stays.
- **The download address.** `sources.ts` joins the dataset page and the resource ids found in the prep notes. The first real run confirms it.
- **The French file.** I did not read it, so I do not know its headers. The job reads the English file only.
- **The 5% and 200-row limits against reality.** They are sensible guesses. If the first real run trips one, the error shows the numbers, and the limit is one line in `validate.ts`.

## 8. Adding a model year

Open the dataset page, find the CSV for the year, copy its download link, and add an entry to `SOURCES` in `pipeline/sources.ts` with the year. The job sorts all years together, newest first. Check that the new file's header matches by running `npm run data:refresh` where you have network access.
