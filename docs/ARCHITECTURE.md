# Architecture

Prozorro Tender Monitor watches the public Prozorro feed, picks the tenders that match a private list of
keywords and CPV codes, stores them in PostgreSQL and sends a daily digest to Telegram.

## How it works

```
                 every hour                                   weekdays, after 08:30 Kyiv time
 Prozorro feed ───────────────► collect ──► PostgreSQL ──────────────► report ──► Telegram
 (id, status, type)        details + match    tenders, items, awards     digest, notified_at
```

**collect** (`src/collect.ts`)
1. Reads the saved feed offset (`sync_state.feed_offset`); the first run starts 24 hours back.
2. Walks the feed page by page until it runs dry and keeps the latest entry per tender id.
3. Keeps competitive tenders that are open (`active.enquiries`, `active.tendering`) and no-tender procedures
   (`reporting`, `negotiation`, `negotiation.quick`) that are `active` or `complete`.
4. Skips tenders already in `seen_tenders`, loads details for the rest in batches of 5 with a pause.
5. Matches keywords and CPV codes, saves everything in chunks of 200.
6. Moves the offset only when every detail request succeeded, so a failed tender is retried next time.

**report** (`src/report.ts`)
1. Takes matched tenders with `notified_at IS NULL` whose bidding is not over.
2. Groups them by keyword block, builds messages under the Telegram size limit and sends them.
3. Sets `notified_at` after each message, so a crash never causes duplicates.
4. `--dry` prints the messages and changes nothing; `--scheduled` sends once a day, not before 08:30 Kyiv time.

## Repository layout

```
src/
  collect.ts              entry point: collect
  report.ts               entry point: report (--dry, --scheduled)
  config.ts               search config: KEYWORDS_JSON env, keywords.local.json, or keywords.example.json
  prozorro/client.ts      API client: feed page, tender details with 429 retry, tender URL, publication date
  prozorro/sync.ts        feed walk and the status / procedure type filter
  filter/matcher.ts       keyword phrase matcher
  filter/cpv.ts           CPV division prefix matcher
  db/models.ts            Sequelize models, SSL for cloud databases, initDb
  db/store.ts             offset, seen ids, transactional saveTenders, purge, state helpers
  report/format.ts        digest formatting and splitting
  telegram/send.ts        Telegram Bot API call
  utils/batch.ts          bounded parallelism with a pause between batches
  utils/sleep.ts
keywords.example.json     sample config committed to the repo
keywords.local.json       the real config, git-ignored
.github/workflows/        collect.yml (hourly), report.yml (weekday mornings)
```

## Data model

Tables are created by `sequelize.sync()`; there are no migrations yet, new columns on existing tables need a manual `ALTER`.

| Table | Purpose |
|---|---|
| `sync_state` | key-value: `feed_offset`, `last_report_date` |
| `seen_tenders` | every processed tender id and when; rows of unmatched tenders are purged after 14 days |
| `tenders` | full data of matched tenders only: number, title, customer (name, EDRPOU, region), procedure type, budget (`NUMERIC`), publication and bidding dates (`timestamptz`), matched words and CPV, `notified_at` |
| `tender_items` | positions of a tender: description, quantity, unit, CPV code |
| `tender_awards` | winners: supplier name, EDRPOU, amount, status, date |

## Key decisions

- **Feed offset instead of calendar days.** Each run continues from the saved position, so a late or missed run
  loses nothing and nothing is processed twice.
- **Two-stage loading.** The feed only has ids, statuses and procedure types; titles and positions need one request
  per tender. The status and type filter runs first, so details are loaded only for tenders worth looking at.
- **No-tender procedures are taken when `active` or `complete`.** They go through all statuses within minutes,
  so an hourly run usually sees them already finished.
- **Slim storage.** Only matched tenders are stored in full; everything else is remembered as an id for 14 days.
  This keeps the database small enough for a free cloud tier.
- **Matcher.** A keyword is a phrase of words; `stem*` allows a case ending of up to 4 letters, a plain word must
  match exactly. Words of a phrase may come in any order with up to 2 other words between them. Hyphens split words,
  Latin lookalike letters are normalized to Cyrillic, and any excluded phrase cancels the match.
- **Keyword AND CPV.** `requireCpv: true` mirrors a manual search (a keyword and a CPV division must both match);
  `false` makes either one enough.
- **Private search config.** Keywords and CPV codes are not in the repository: locally they live in an ignored file,
  in CI in the `KEYWORDS_JSON` secret.
- **Politeness towards the API.** Batches of 5 requests with a pause, retry on HTTP 429 with backoff
  (`Retry-After` when present).
- **Money and time.** Amounts are `NUMERIC`, never floats; all timestamps carry a time zone.
- **CI logs are public.** In CI (`CI=true`) the collector does not print matched tenders.

## Configuration

| Variable | Used by | Meaning |
|---|---|---|
| `DATABASE_URL` | collect, report | PostgreSQL connection string; SSL is enabled for non-local hosts |
| `KEYWORDS_JSON` | collect, report | the whole search config as JSON; falls back to `keywords.local.json` |
| `TELEGRAM_BOT_TOKEN` | report | bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | report | chat that receives the digest |

Search config shape: `requireCpv`, `cpv[]`, `exclude[]`, `blocks[] { name, keywords[] }`.

## Running locally

```bash
npm install
npm run collect            # fetch and store new tenders
npm run report -- --dry    # preview the digest without sending
npm run report             # send the digest now
npm run typecheck && npm run lint
```

## Hosting and limits

- Database: Neon free tier (0.5 GB storage, 100 compute hours a month, compute sleeps after 5 minutes idle).
- Compute: GitHub Actions, free for public repositories. Schedules run in UTC and can start late;
  scheduled workflows are disabled after 60 days without repository activity.
- The report job fires several times each weekday morning, the script itself picks the first run after 08:30 Kyiv time.

## Development workflow

GitHub Flow: protected `main`, one short-lived branch per task, squash-merged pull requests,
Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`), `tsc --noEmit` and ESLint before every commit.

## Roadmap

- Health check: Telegram alert when no successful collection happened for more than two hours.
- A separate "no-tender contracts" section in the digest with the supplier, EDRPOU and amount.
- Web interface: favorites, history of a customer's past tenders for the same goods, calendar, change alerts,
  Excel and Google Sheets export.
- Competitor tracking based on awards (watch list of EDRPOU codes).
- Keyword blocks and exclusions in the database, edited from the interface.
