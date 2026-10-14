# CTO notes

You don't have to write this code. You have to be able to do three things with it:

1. **Explain it** to an interviewer, a partner or a customer.
2. **Find a bug** in it when a number looks wrong.
3. **Know what to ask for** when you want it changed.

Read sections 1 and 2 once (about 20 minutes). Keep section 4 for the day something breaks. Do section 5 with your own hands, because that is where it sticks.

## 1. The whole app in one picture

```
 monthly timer                      you type
┌───────────────┐   commits      ┌────────────┐    ┌─────────────┐    ┌───────────────┐
│ data pipeline │ ─────────────> │  the form  │ ─> │ evaluate()  │ ─> │ total, ranking│
│ pipeline/*.ts │  vehicles.json │ (text only)│    │ src/core/*  │    │ compare, link │
└───────────────┘                └────────────┘    └─────────────┘    └───────────────┘
        ^ gate: bad file, old data stays    main.ts reads it     main.ts paints it │
                                                  └──────────── every keystroke ───┘
```

There is no server and no database. The page is a handful of files that GitHub hands to the phone, and then the phone does all the work. The only thing that changes without a person touching it is `public/data/vehicles.json`, and the pipeline is what changes it.

- **The pipeline** (`pipeline/`) fetches one government file a month and refuses anything that looks wrong.
- **The brain** (`src/core/`) only knows numbers. It has never heard of a button.
- **The screen** (`index.html`, `src/ui/`, `src/styles/`) only knows how to look. It can't do math.
- **The wiring** (`src/main.ts`) carries text from the boxes to the brain and the answer back.

## 2. Seven ideas this repo teaches

### An open-data pipeline (the new one)

A script fetches public data on a schedule, checks it, and commits a small file the site reads. The check is the point. Data you did not write can be wrong in ways you cannot predict, so the script assumes it is wrong until it passes.

- **See it:** [`pipeline/run.ts`](../pipeline/run.ts), then [`pipeline/validate.ts`](../pipeline/validate.ts). The long explanation is [docs/THE-PIPELINE.md](THE-PIPELINE.md).
- **Try it:** `npm test -- pipeline`. Read the test names top to bottom. They describe each way a file can be bad.
- **Say it:** "A monthly job downloads the government's fuel ratings, checks every row and the whole file, and only then commits. If a check fails the job goes red and the site keeps last month's data."

### Money as whole numbers

Computers store 0.1 + 0.2 as 0.30000000000000004. So money here is whole cents everywhere, fuel prices are whole thousandths of a dollar, and fuel use is whole hundredths of a litre per 100 km. The fuel cost multiplies three whole numbers, divides once, and rounds once, half up. There is no float to drift.

- **See it:** `fuelCostCents()` in [`src/core/fuel.ts`](../src/core/fuel.ts). It is four lines.
- **Say it:** "Every amount is an integer in its smallest unit. Rounding happens once, at the end, so the total always equals the sum of the lines."

### The edge of the system is where you check

People type `$1,234.56`, `1.234,56`, `8,5`, `NaN`, `1e9` and `-0`. [`src/core/parse.ts`](../src/core/parse.ts) is the one doorway. Text goes in; a whole number or a sentence explaining the problem comes out. After that doorway nothing can be NaN, because nothing can get in that is not a number. That is why the maths files do no checking at all.

- **See it:** `parseMoney()`, and the test file next to it. One test throws 2,000 random strings at every reader and checks that nothing ever returns NaN, Infinity, a fraction or minus zero.
- **Say it:** "Validation lives at the boundary. Past the boundary, types and units do the work."

### Pure functions and property tests

A pure function gets numbers in and gives numbers out and does nothing else. `costQuote()`, `passCost()`, `rankQuotes()` and `compareQuotes()` are pure. That is why the tests need no browser.

A property test invents hundreds of random inputs and checks a rule that must hold for all of them. Here: more kilometres never lowers the cost, more park days never lowers the pass cost, doubling the fuel price doubles the fuel cost to within a cent, and the total always equals the sum of its lines.

- **See it:** [`src/core/fuel.test.ts`](../src/core/fuel.test.ts), the last four tests.
- **Run it:** `npm test`.
- **Say it:** "Example tests prove the cases I thought of. Property tests cover the ones I didn't."

### State in a link, and a link you don't trust

The whole form is packed into the part of the address after the `#`: `#s=v1.<text>`. That is both "remember my trip" and "send it to a friend", with no server. Browsers never send the `#` part anywhere, so what you type stays on two devices.

Anyone can edit that link, so [`decodeState()`](../src/core/share.ts) treats it as hostile. A size cap, a version check, every field's type checked, strings clipped, control characters stripped, unknown choices swapped for safe ones. Labels are only ever put on the page as text, never as HTML.

- **See it:** `decodeState()` and its tests, especially "keeps script text as text".
- **Try it:** press **Copy link to this trip**, paste it in a private window. Then break the link by deleting the last few characters.
- **Say it:** "State lives in the URL fragment, so sharing needs no backend, and the decoder assumes the link was written by an attacker."

### Offline with a service worker, and data that changes

A service worker is a small script the browser keeps for one site. This one saves a copy of every file the first time the page opens, so it works with no signal. The copy is named by a hash of the files' contents, so the monthly data commit changes the hash and phones pick up the new data within a visit or two.

The catch: the worker answers files from its saved copy first. Data you want fresh needs the new cache name to arrive first. It is why a test that swaps `vehicles.json` has to turn the worker off.

- **See it:** [`public/sw.js`](../public/sw.js) and [`scripts/stamp-sw.mjs`](../scripts/stamp-sw.mjs).
- **Try it:** open the live site, switch to airplane mode, reload.

### CI/CD with two workflows

CI means a robot runs the tests on every push and every pull request. CD means that if they pass on main, the robot deploys. [`ship.yml`](../.github/workflows/ship.yml) does both. [`refresh-data.yml`](../.github/workflows/refresh-data.yml) is the timer: it runs the pipeline, runs the tests again against the new data, commits, and then starts `ship.yml`.

The last step is there because a push made with the built-in token does not start other workflows. That is deliberate, to stop loops, and it is the thing most people trip on first.

- **Say it:** "Two workflows: one tests and deploys on every push, one refreshes data monthly and hands off to the first."

## 3. Where things live

| You want to change... | Open this |
| --- | --- |
| A Parks Canada price, the family rate size, a route's distance, the winter rules | `src/data/reference.json` |
| How the pass is chosen | `src/core/pass.ts` |
| What counts as a valid number in a box | `src/core/parse.ts` |
| How a total is built, or how ties rank | `src/core/trip.ts` |
| The comparison sentence | `src/core/compare.ts` |
| What the pipeline accepts or rejects | `pipeline/ratings.ts` and `pipeline/validate.ts` |
| Which file the pipeline downloads | `pipeline/sources.ts` |
| When the monthly job runs | `cron` in `.github/workflows/refresh-data.yml` |
| A fixed label on the form | `index.html` |
| The sample trip | `sampleState()` in `src/core/state.ts` (some tests expect its numbers) |
| A colour or a font | `src/styles/brand.css` |
| Layout and spacing | `src/styles/app.css` |

## 4. When something breaks

| What you see | Likely cause | Where to look | How to check |
| --- | --- | --- | --- |
| A total looks wrong | The maths, or the form feeding it the wrong box | `evaluate.ts`, then `main.ts` | Read the lines under the total and add them by hand. Then write the trip as a test in `trip.test.ts`. If it passes, the maths is fine and the bug is in the wiring |
| The page shows, but typing does nothing | A JavaScript error on start-up | Browser console | The error names the file and line. A missing `id` in `index.html` is reported by name |
| "Refresh data" is red | A check failed, or the file changed shape | The failed run's log, first lines | It names the check and the numbers. The old data is still deployed. `Missing columns:` lists the names found, so you can see what Natural Resources Canada renamed |
| "Refresh data" is red with `answered 404` | The download address changed | `pipeline/sources.ts` | Open the dataset page, copy the CSV's new link |
| The vehicle picker is missing | `vehicles.json` is empty or failed to load | The line under "Add another quote" says which | Run **Refresh data** once. The page says the same thing in plain words |
| The site shows old data a day after a refresh | The phone's saved copy | `public/sw.js` | Visit twice. The worker swaps copies in the background |
| Green check, but there is no website | The repo is private, so the deploy steps are skipped on purpose | `.github/workflows/ship.yml` | Make the repo public, set Pages to **GitHub Actions**, run the workflow once |
| Red X at "Ask GitHub where this site will live" | Public repo, Pages not switched on | Settings, Pages, Source | Set it to **GitHub Actions**, then **Re-run jobs** |
| A shared link opens the sample | The link was cut off when pasted | `decodeState()` in `share.ts` | It must start `#s=v1.` and be complete. A page notice says when a link could not be read |
| Works on my laptop, not on a phone | Old browser | `tsconfig.json`, `vite.config.ts` target ES2022 | Any phone updated since 2022 is fine |

**The one debugging habit that matters:** reproduce it as a test first. A bug you can trigger with a test is a bug you can fix once and keep fixed.

## 5. Your turn

Five real changes, easiest first. Each one is a commit with your name on it. I ran 1, 2 and 4 in a scratch copy and got the results described.

1. **Add a route.** In `src/data/reference.json`, add this object to `routes`, before the `kananaskis` entry:
   `{ "id": "drumheller", "label": "Drumheller", "oneWayKm": null, "method": "typed", "basis": "I have not looked this distance up.", "sourceUrls": [] }`
   *Done when:* Drumheller is in the **Where to** menu, picking it shows a **One-way distance** box, and no total appears until you type one.
2. **Change the family rate.** In `reference.json`, set `maxPerVehicle` to `6`. Run `npm test`. *Done when:* tests go red. Read which ones, and why: seven adults used to share one flat $24.50 and now pay one by one. Then decide whether Parks Canada's rule changed (change the data and the two tests) or you mistyped (change it back). That red X is the safety net doing its job.
3. **Write a test.** Take a real quote you have for a trip, and add it to `src/core/trip.test.ts` as a new `it(...)` with the total you worked out by hand. *Done when:* it passes, or it fails and you have found a bug.
4. **Tighten the gate.** In `pipeline/validate.ts`, set `minRows` in `LIMITS` to `300` and run `npm test`. *Done when:* the pipeline tests that write data go red with `Only 250 usable rows`. The fixtures have 250 rows, so you have just seen the gate refuse a file. Change it back, or raise the fixture size in the tests and in `makeCsv(250)`.
5. **Show the distance in the headline.** In `paintHero()` in `src/main.ts`, add `kmText(ev.trip.km ?? 0)` to the `hero-sub` line, for example `` `... · ${kmText(ev.trip.km ?? 0)} round trip` ``. *Done when:* the line under the big total reads "Sample A: small car · 4 days · $99.29 a day · 260 km round trip". This is a screen-only change, so no test fails. Ask Claude how you would test it.

## 6. Questions you should be ready for

**Why not just copy the fuel numbers into a file?**
Because they change every model year and I would forget. The pipeline downloads them, checks them and commits them, and a bad download cannot get through.

**How do you know a bad download cannot get through?**
Tests. A local server plays the portal, including its redirect, and sends a server error, a web page, a file that is too small and a file with a missing column. After each one the old files are byte-for-byte the same.

**Has it read the real file?**
Not yet when this was written. The build machine could not reach the portal. The first run of the **Refresh data** workflow is the test, and it fails safe.

**Why no React or Astro?**
One page with a form and a list. The structure a framework gives you, logic separate from view, is here by hand. The spec asked for Astro. Astro is for pages made at build time, and this page does its work in the browser.

**Why are prices whole numbers?**
Floating point cannot store 0.1 exactly. Whole cents and one rounding step mean the total is always the sum of the lines.

**Where is my data stored?**
Nowhere. There is no server. A share link carries your numbers after the `#`, which browsers do not send.

**What did the AI do, and what did you do?**
Say it straight: Claude wrote most of the code as a pair programmer. You chose the problem, made the product decisions, reviewed the changes and can walk through any file. Then walk through one.

## 7. Words you'll hear

| Word | Plain meaning |
| --- | --- |
| Pipeline | Steps that move data from a source to where it is used, in order |
| Provenance | Where a number came from, and when |
| Gate | A check that must pass before data is accepted |
| Cron | A schedule written as five fields. `17 9 8 * *` is the 8th of each month at 09:17 UTC |
| Redirect | A web address that answers "go to this other address" |
| Atomic write | Write to a temporary file, then rename, so nothing is ever half-written |
| Property test | A test that checks a rule across hundreds of random inputs |
| Service worker | A script the browser keeps for one site, here used to work offline |
| CI / CD | Robot runs the tests / robot deploys if they pass |
| Fixture | A small made-up input file kept in the repo for tests |
