# How this could pay for itself

Banff Trip Cost is free and stays free. This page is the honest version of how a free calculator could turn into money, what each path needs to be true, and what I don't know yet.

No market-size numbers here. I haven't measured the market, so I'm not going to make one up.

## Who it's for

People about to book a rental car for a Rockies trip, mostly visitors flying into Calgary. The moment it's for: three tabs of rental offers are open, each with a different headline number, and you want to know which one is actually cheaper once you have driven the road and paid the park.

## What's free forever

The calculator, the ranking, the comparison, sharing and offline use. That is the reason anyone finds it. Charging for it would remove the one thing it is good at: being opened fast by someone who has never heard of me.

## Two ways it could earn

### 1. A disclosed referral arrangement with trip services

Today the page names no rental company, ranks none and links to none, and has no affiliate links. That is a deliberate promise, and the README and the page both state it. A referral arrangement would break that promise on the day it starts, so it has to be a visible decision, not a quiet one.

What it would look like: a clearly labelled box, after the ranking and never inside it, that says "I earn a fee if you book through this link" next to one named trip service such as an activity or accommodation booking site. The ranking itself would not change and would never include a company that pays.

- **What has to be true:** enough people finish a ranking and then go looking for something to book. I have no number for that.
- **Rules before I'd do it:** disclosure on the page, in plain words, next to the link. Terms checked for each partner. No rental company, so the ranking stays neutral.
- **Cost to deliver:** a few hours of building and a lot of care about wording.
- **Risk:** it costs trust. The tool is useful because it is neutral.

### 2. A paid trip-planning sheet

The calculator prices one trip. A spreadsheet plus a short PDF could plan it: a day-by-day sheet with the distances between the stops, the park days and passes per day, and a packing and winter-driving list built from the Parks Canada rules.

- **Price to test:** $9 once, not a subscription. A Rockies trip is a once-or-twice-a-year thing.
- **What has to be true:** people who use the free calculator also want the planning around it.
- **Cost to deliver:** near zero. It is a file, and the figures already exist in `src/data/reference.json`.
- **Licence note:** the park prices are facts and are attributed. Parks Canada's web wording is not copied, and if this were sold the page text would need permission to reuse, so the sheet would summarise rules in my own words and link to the source.

## What it costs to run

| Thing | Cost |
| --- | --- |
| Hosting (GitHub Pages) | $0 |
| The monthly data job (GitHub Actions) | $0 at this size |
| Servers, database | none |
| Domain | optional |

There is no monthly bill to outrun. The break-even is the first sale.

## The one-week demand test (before building anything paid)

1. Ship the free calculator.
2. Add a "Want a day-by-day sheet?" link that goes to a waitlist form. Nothing to buy yet. No tracking inside the calculator, which isn't changing.
3. Post the calculator where Rockies trip planning happens and sharing a tool is welcome, with a real worked example, labelled as a sample.
4. Count two numbers: clicks on the link I post (a tagged short link per post) and waitlist sign-ups.

**Go:** 25 or more sign-ups in a week. Build the sheet and email them.
**No-go:** fewer than 5. The calculator is fine, the offer is wrong. Change the offer, not the code.
**In between:** run one more week in a different place before deciding.

## What I don't know yet

- Whether anyone wants a plan, or only the number.
- Whether a referral box earns anything without costing the trust the tool depends on.
- Whether the Rockies is the right place to start, or whether the same calculator is wanted for other road trips.

## Ground rules

- No ads and no selling data. The calculator doesn't collect any, so there is nothing to sell.
- Anything paid has a refund button.
- Prices and rules on the page are copied from official pages with their dates. The page is a calculator, not financial advice, and says so.
- Not affiliated with Parks Canada, Natural Resources Canada or any rental company, and no money arrangement changes that.
