# Prozorro Tender Monitor

A small tool that checks new tenders on [Prozorro](https://prozorro.gov.ua) every day, filters them by keywords and sends a report with the matches.

> **Status:** work in progress. The project is being built step by step, and the features below are planned unless marked otherwise.

## Features

- [x] TypeScript project with strict type checking and linting
- [ ] Fetching tenders from the public Prozorro API (feed pagination)
- [ ] Keyword filtering with support for Ukrainian word forms
- [ ] Persistent state, so each run continues from where the previous one stopped and no tender is sent twice
- [ ] Daily report in Telegram: title, customer, expected value, deadline, link
- [ ] Scheduled run every morning with GitHub Actions
- [ ] Web interface for managing keywords and browsing found tenders

## Tech stack

- Node.js, TypeScript
- PostgreSQL, Sequelize
- Telegram Bot API
- GitHub Actions
- ESLint

## Getting started

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/KazymyrYan/prozorro-tender-monitor.git
cd prozorro-tender-monitor
npm install
npm run start
```

Other useful commands:

```bash
npm run typecheck   # type checking
npm run lint        # linting
```

## Development workflow

- `main` is protected: every change goes through a Pull Request.
- Work happens in short-lived branches (`feature/...`, `fix/...`, `docs/...`, `chore/...`).
- Commit messages follow the [Conventional Commits](https://www.conventionalcommits.org) style.

## License

Released under the [MIT License](LICENSE).