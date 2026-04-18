# Global Outages

`ena-bot` is the TypeScript implementation of the Global Outages platform. It currently supports:

- a Telegram bot built with `grammy`
- a worker process that syncs outage data and sends notifications
- deterministic ENA electricity outage parsing
- PostgreSQL storage via Drizzle ORM
- Armenia region and settlement seeding
- optional Ollama-based address cleanup for ambiguous raw address blobs

The current implementation is electricity-first and provider-ready. ENA is the only provider wired today, but the codebase is structured to support more utilities and more providers later.

## Project Layout

```text
apps/
  telegram-bot/   Telegram polling entrypoint
  worker/         Sync + notification entrypoint

packages/
  ai/             Deterministic and Ollama address formatters
  application/    Orchestration services
  data/           Static Armenia region/settlement dataset
  domain/         Shared provider/domain types
  providers/      Provider-specific ingestion and normalization
  shared/         Env and UI text constants
  storage/        Drizzle schema, repositories, and seeders
  telegram-ui/    grammY bot menus and conversations

tests/
  Parser, formatter, and message-formatting tests
```

More detail is in [docs/implementation.md](docs/implementation.md).

## Runtime Model

The app is split into two long-running processes:

- `telegram-bot`: handles user interaction and subscription management through Telegram long polling
- `worker`: fetches outages from ENA, normalizes them, stores them, and sends deduplicated notifications

Both processes use the same PostgreSQL database.

## Requirements

- Node.js 20+ recommended
- npm
- PostgreSQL
- Telegram bot token

Optional:

- Ollama, if you want LLM-assisted cleanup for large raw address strings

## Installation

```bash
npm install
```

Copy the env template and fill in real values:

```bash
cp .env.example .env
```

Required variables:

- `DATABASE_URL`
- `TELEGRAM_TOKEN`

Optional variables:

- `ENA_BASE_URL`
- `ENA_OUTAGES_PATH`
- `WORKER_SYNC_CRON`
- `WORKER_NOTIFY_CRON`
- `TELEGRAM_DEFAULT_LOCALE`
- `USE_OLLAMA_ADDRESS_FORMATTER`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

## Database Setup

Generate or push the schema:

```bash
npm run db:generate
npm run db:push
```

Seed Armenia regions, cities, villages, and Yerevan districts:

```bash
npm run seed:armenia
```

## Running Locally

Start the Telegram bot:

```bash
npm run dev:telegram
```

Start the worker:

```bash
npm run dev:worker
```

Production builds:

```bash
npm run build
npm run start:telegram
npm run start:worker
```

## Tests

Run the current test suite:

```bash
npm test
```

Current test coverage includes:

- ENA parser basics
- Telegram message formatting
- deterministic address formatter behavior

## ENA Pipeline

The ENA pipeline is:

1. fetch raw HTML from ENA
2. parse HTML into structured outage events
3. normalize events into provider-agnostic outage records
4. optionally refine oversized address blobs with Ollama
5. replace active provider events in PostgreSQL
6. match active subscriptions
7. send Telegram notifications only for unsent outage windows

## Ollama Address Formatting

The primary parser is deterministic. Ollama is only used as a fallback for raw address strings that look too large or too ambiguous to keep as one entry.

Enable it with:

```env
USE_OLLAMA_ADDRESS_FORMATTER=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
```

If Ollama fails or returns an invalid payload, the app falls back to the original deterministic addresses.

## Current Scope

- Provider support: `ena`
- Utility support: `electricity`
- Search mode: free-text region/address matching
- Notification delivery: Telegram only

Not implemented yet:

- water outage provider
- webhook deployment mode
- richer matching against seeded settlements/regions
- production migration files checked into the repo

