# Architecture

Prozorro Tender Monitor watches the public Prozorro feed, picks the tenders that match a private list of
keywords and CPV codes, stores them in PostgreSQL and sends a daily digest to Telegram.

## How it works

```
                 every hour                                   weekdays, after 08:30 Kyiv time
 Prozorro feed ───────────────► collect ──► PostgreSQL ──────────────► report ──► Telegram
 (id, status, type)        details + match    tenders, items, awards     digest, notified_at
                                                  ▲
                                                  └── health (every 3 hours): alert if collect is silent
```

**collect** (`src/collect.ts`)
1. Reads the saved feed offset (`sync_state.feed_offset`); the first run starts 24 hours back.
2. Walks the feed page by page until it runs dry and keeps the latest entry per tender id.
3. Keeps competitive tenders that are open (`active.enquiries`, `active.tendering`) and no-tender procedures
   (`reporting`, `negotiation`, `negotiation.quick`) that are `active` or `complete`.
4. Skips tenders already in `seen_tenders`, loads details for the rest in batches of 5 with a pause.
5. Matches keywords and CPV codes, saves everything in chunks of 200.
6. Moves the offset only when every detail request succeeded, so a failed tender is retried next time.
7. Records the time of that fully successful run in `sync_state.last_collect_ok`.

**report** (`src/report.ts`)
1. Takes matched tenders with `notified_at IS NULL` whose bidding is not over.
2. Recomputes the hits with the current config over the saved title and items (items are read with
   `order: id ASC`, so their indexes match the matcher). Nothing extra is stored in the database.
3. Splits the tenders into competitive ones and no-tender ones. Competitive tenders are grouped by keyword block;
   no-tender ones go to a separate section "Закупівлі без торгів" at the end, with the supplier, EDRPOU,
   the winner's amount and the date. The header shows "(без торгів: N)".
4. In a card the item that matched comes first and is marked 🎯; a word found in the title is marked "(в назві)".
   A tender whose matched words are all weak gets ⚪ in the "Слова" line and goes to the end of its section.
5. Builds messages under the Telegram size limit and sends them. A block title gets "(далі)" only where
   the block really continues in the next message.
6. Sets `notified_at` after each message, so a crash never causes duplicates.
7. `--dry` prints the messages and changes nothing; `--scheduled` sends once a day, not before 08:30 Kyiv time.

**health** (`src/health.ts`)
1. Reads `sync_state.last_collect_ok`; if it was never written, does nothing.
2. If the last successful collect is older than 8 hours, sends a Telegram alert.
3. Repeats the alert at most once per 6 hours (`sync_state.last_health_alert`), so a long outage is not spam.

## Repository layout

```
src/
  collect.ts              entry point: collect
  report.ts               entry point: report (--dry, --scheduled); recomputes hits, marks weak ones
  health.ts               entry point: health check
  recheck.ts              entry point: recheck (--all, --apply)
  config.ts               search config: KEYWORDS_JSON env, keywords.local.json, or keywords.example.json
  prozorro/client.ts      API client: feed page, tender details with 429 retry, tender URL, publication date
  prozorro/sync.ts        feed walk and the status / procedure type filter
  filter/matcher.ts       keyword phrase matcher: createDetailedMatcher (hit places), createMatcher on top of it
  filter/cpv.ts           CPV division prefix matcher
  db/models.ts            Sequelize models, SSL for cloud databases, initDb
  db/store.ts             offset, seen ids, transactional saveTenders, purge, state helpers
  report/format.ts        digest formatting, splitting, weak-match sorting and the no-tender section
  telegram/send.ts        Telegram Bot API call
  utils/batch.ts          bounded parallelism with a pause between batches
  utils/sleep.ts
keywords.example.json     sample config committed to the repo
keywords.local.json       the real config, git-ignored
.github/workflows/        collect.yml (hourly), report.yml (weekday mornings), health.yml (every 3 hours)
```

## Data model

Tables are created by `sequelize.sync()`; there are no migrations yet, new columns on existing tables need a manual `ALTER`.

| Table | Purpose |
|---|---|
| `sync_state` | key-value: `feed_offset`, `last_report_date`, `last_collect_ok`, `last_health_alert` |
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
  so a frequent run usually sees them already finished.
- **Slim storage.** Only matched tenders are stored in full; everything else is remembered as an id for 14 days.
  This keeps the database small enough for a free cloud tier.
- **Matcher.** A keyword is a phrase of words; `stem*` allows a case ending of up to 4 letters, a plain word must
  match exactly. Words of a phrase may come in any order with up to 2 other words between them. Hyphens split words,
  Latin lookalike letters are normalized to Cyrillic. The title and every item are checked separately: a phrase never
  mixes words of two positions, and an excluded phrase cancels only the position it is found in and may have up to
  6 words between its own words.
- **Hit places.** `createDetailedMatcher` returns for every matched word where it fired (0 = title, 1..n = items).
  `createMatcher` is a thin layer over it and is what `collect` and `recheck` use.
- **Hits are recomputed at report time.** The digest reflects the current config, not the config of the day the
  tender was collected, and no extra columns are needed.
- **Weak words.** The optional `weak` list holds words that match often but are often noise (for example
  an insulation word that also appears in tools). A tender whose matched words are all weak is still sent,
  but marked ⚪ and placed at the end of its section instead of being dropped.
- **Keyword AND CPV.** `requireCpv: true` mirrors a manual search (a keyword and a CPV division must both match);
  `false` makes either one enough.
- **Publication date.** The notice date, else the start of the first period, else the creation date: no-tender
  procedures have no periods at all, so they use `dateCreated`.
- **Private search config.** Keywords and CPV codes are not in the repository: locally they live in an ignored file,
  in CI in the `KEYWORDS_JSON` secret.
- **Safe config changes.** `recheck` runs the current config over stored tenders and shows what would change;
  `--apply` hides dropped unsent tenders via `notified_at` and updates words, it never deletes rows.
  Already sent tenders are left as they are.
- **Politeness towards the API.** Batches of 5 requests with a pause, retry on HTTP 429 with backoff
  (`Retry-After` when present).
- **Money and time.** Amounts are `NUMERIC`, never floats; all timestamps carry a time zone.
- **CI logs are public.** In CI (`CI=true`) the collector does not print matched tenders.
- **Health check threshold is 8 hours, not 2.** In practice GitHub starts the "hourly" job every 3-5 hours;
  the longest gap seen was 5.4 hours. A tighter limit would fire on ordinary schedule delays.
- **Health check is a separate job.** A check inside `collect` could not notice a `collect` that never started or hung.

## Configuration

| Variable | Used by | Meaning |
|---|---|---|
| `DATABASE_URL` | collect, report, health | PostgreSQL connection string; SSL is enabled for non-local hosts |
| `KEYWORDS_JSON` | collect, report | the whole search config as JSON; falls back to `keywords.local.json` |
| `TELEGRAM_BOT_TOKEN` | report, health | bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | report, health | chat that receives the digest and the alerts |

Search config shape: `requireCpv`, `cpv[]`, `exclude[]`, `weak[]` (optional), `blocks[] { name, keywords[] }`.
Words in `weak` are written exactly as in the blocks, including `*`.

The config lives in two places: the local file and the `KEYWORDS_JSON` secret. After editing the file, upload it
with `gh secret set KEYWORDS_JSON < keywords.local.json`.

## Running locally

```bash
npm install
npm run collect            # fetch and store new tenders
npm run report -- --dry    # preview the digest without sending
npm run report             # send the digest now
npm run health             # check that collection is alive, alert in Telegram if not
npm run recheck            # re-run the current search config over stored tenders, shows what would change
npm run typecheck && npm run lint
```

## Hosting and limits

- Database: Neon free tier (0.5 GB storage, 100 compute hours a month, compute sleeps after 5 minutes idle).
- Compute: GitHub Actions, free for public repositories. Schedules run in UTC and can start late;
  scheduled workflows are disabled after 60 days without repository activity.
- The collect job is scheduled hourly but in practice starts every 3-5 hours, so the data is a few hours old at worst.
- The report job fires several times each weekday morning, the script itself picks the first run after 08:30 Kyiv time.
- The health job shares the schedule risk with the others: if GitHub disables schedules, it goes silent together with collect.

## Development workflow

GitHub Flow: protected `main`, one short-lived branch per task, squash-merged pull requests,
Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`), `tsc --noEmit` and ESLint before every commit.

## Roadmap

- Web interface: favorites, history of a customer's past tenders for the same goods, calendar, change alerts,
  Excel and Google Sheets export.
- Competitor tracking based on awards (watch list of EDRPOU codes).
- Keyword blocks, exclusions and weak words in the database, edited from the interface.
