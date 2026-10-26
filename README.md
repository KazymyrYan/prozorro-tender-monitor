# Prozorro Tender Monitor

A tool that watches the public [Prozorro](https://prozorro.gov.ua) feed, picks the tenders that match a private list of keywords and CPV codes, stores them in PostgreSQL and sends a daily digest to Telegram.

## Features

- [x] TypeScript project with strict type checking and linting
- [x] Prozorro API client: feed pagination, tender details, retry with backoff on HTTP 429
- [x] Keyword matching for Ukrainian word forms: `stem*` endings, any word order, excluded phrases
- [x] CPV code filter, either combined with keywords (AND) or on its own
- [x] Competitive tenders and no-tender procedures (reporting, negotiation) with their winners
- [x] Incremental collection: every run continues from the saved feed offset, nothing is lost or processed twice
- [x] Daily digest in Telegram, grouped by keyword block, no duplicates
- [x] Scheduled runs on GitHub Actions: collection every hour (GitHub often delays it to every 3-5 hours), weekday morning report
- [x] Health check: a Telegram alert when collection has not succeeded for 8 hours
- [ ] Separate digest section for no-tender contracts
- [ ] Web interface: favorites, customer history, change alerts, Excel and Google Sheets export

## How it works

```
Prozorro feed --> collect --> PostgreSQL --> report --> Telegram
```

- `collect` reads the feed, keeps only tenders worth a look, loads their details and stores the ones that match.
- `report` takes matched tenders that were not sent yet and sends them in size-limited messages.

More details and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech stack

- Node.js, TypeScript
- PostgreSQL (Neon), Sequelize
- Telegram Bot API
- GitHub Actions
- ESLint

## Getting started

Requirements: a current Node.js LTS, a PostgreSQL database, a Telegram bot.

```bash
git clone https://github.com/KazymyrYan/prozorro-tender-monitor.git
cd prozorro-tender-monitor
npm install
cp .env.example .env                              # fill in the values
cp keywords.example.json keywords.local.json      # your own keywords and CPV codes
```

Environment variables:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | chat that receives the digest |
| `KEYWORDS_JSON` | optional, the whole search config as JSON; replaces `keywords.local.json` (used in CI) |

Tables are created automatically on the first run.

## Commands

```bash
npm run collect              # fetch and store new tenders
npm run report -- --dry      # preview the digest, changes nothing
npm run report               # send the digest now
npm run health               # check that collection is alive, alerts in Telegram if not
npm run typecheck            # type checking
npm run lint                 # linting
```

## Deployment

Three jobs run on GitHub Actions: `collect.yml` every hour, `report.yml` on weekday mornings (the script itself sends once a day, not before 08:30 Kyiv time) and `health.yml` every 3 hours. The database URL, Telegram credentials and the search config are repository secrets. Matches are not printed in CI logs.

## Development workflow

- `main` is protected: every change goes through a Pull Request.
- Work happens in short-lived branches (`feature/...`, `fix/...`, `docs/...`, `chore/...`).
- Commit messages follow the [Conventional Commits](https://www.conventionalcommits.org) style.

## License

Released under the [MIT License](LICENSE).