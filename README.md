# ENA Bot

`ena-bot` is a TypeScript service for tracking planned electricity outages from ENA and delivering them through Telegram.

Today the project focuses on one concrete workflow:

- fetch outage data from ENA
- normalize and store it in PostgreSQL
- let users search outages in Telegram
- let users follow addresses or regions
- notify users only when a matching outage has not already been sent

The codebase is already split in a way that can support more providers, more utilities, and richer matching later, but the current production shape is ENA electricity first.

## Purpose

The project exists to turn a provider outage page into something users can actually work with:

- searchable by address or region
- followable from Telegram
- deduplicated across repeated worker runs
- structured enough to extend beyond a single provider

It is not just a chat bot. It is a small ingestion and notification system with Telegram as the current delivery surface.

## Stack

Core stack:

- TypeScript
- Node.js 22
- `grammy` for the Telegram bot
- `@grammyjs/conversations` for bot flows
- PostgreSQL
- Drizzle ORM and Drizzle Kit
- `axios` and `cheerio` for provider fetching and HTML parsing
- `node-schedule` for recurring worker jobs

Optional:

- Ollama for fallback cleanup of oversized or ambiguous address blobs

## Runtime Model

The app runs as two separate long-lived processes:

- `telegram-bot`
  - receives user messages through Telegram long polling
  - handles search and subscription management
- `worker`
  - fetches and parses ENA outage data
  - replaces active provider events in the database
  - processes notification delivery

Both processes share the same PostgreSQL database.

## How It Works

High-level flow:

1. the worker fetches ENA outage HTML
2. the parser extracts dates, regions, time windows, and addresses
3. the provider normalizes that data into shared outage entities
4. the service stores active events and searchable addresses in PostgreSQL
5. Telegram users search by free text or create follows
6. the worker periodically matches follows against active outages
7. sent notifications are recorded so the same subscription/window is not resent

## Project Structure

```text
apps/
  telegram-bot/   Telegram polling entrypoint
  worker/         Sync and notification entrypoint

packages/
  ai/             Deterministic and Ollama address formatters
  application/    Main orchestration services
  data/           Static Armenia geography dataset
  domain/         Shared provider and domain types
  providers/      Provider-specific fetch/parse/normalize logic
  shared/         Env parsing and shared UI text
  storage/        Drizzle schema, DB client, repositories, seeders
  telegram-ui/    grammY bot handlers and conversations

tests/
  Parser and message-formatting tests

drizzle/
  Generated Drizzle migration artifacts
```

More implementation detail is in [docs/implementation.md](docs/implementation.md).

## Implementation Structure

Main entrypoints:

- [apps/telegram-bot/main.ts](apps/telegram-bot/main.ts)
- [apps/worker/main.ts](apps/worker/main.ts)

Main orchestration service:

- [packages/application/global-outages-service.ts](packages/application/global-outages-service.ts)

Key modules:

- [packages/telegram-ui/bot.ts](packages/telegram-ui/bot.ts)
  - Telegram menus, conversations, request logging, middleware error handling
- [packages/application/worker-service.ts](packages/application/worker-service.ts)
  - startup sync, scheduled sync, scheduled notification runs, worker run logging
- [packages/providers/ena/provider.ts](packages/providers/ena/provider.ts)
  - ENA provider adapter
- [packages/providers/ena/parser.ts](packages/providers/ena/parser.ts)
  - HTML parsing and address normalization helpers
- [packages/storage/db/schema.ts](packages/storage/db/schema.ts)
  - Drizzle schema for providers, outages, subscriptions, deliveries, and supporting tables
- [packages/storage/repositories](packages/storage/repositories)
  - DB access per aggregate or workflow

## Storage Model

Main tables:

- `providers`
- `users`
- `subscriptions`
- `regions`
- `settlements`
- `outage_events`
- `outage_windows`
- `outage_locations`
- `sync_runs`
- `notification_deliveries`

Important behavior:

- `outage_events`, `outage_windows`, and `outage_locations` keep provider data queryable
- `subscriptions` stores user follows
- `notification_deliveries` prevents duplicate notification sends
- `sync_runs` records worker sync history

## Environment

Copy the template:

```bash
cp .env.example .env
```

Required:

- `DATABASE_URL`
- `TELEGRAM_TOKEN`

Optional:

- `ENA_BASE_URL`
- `ENA_OUTAGES_PATH`
- `WORKER_SYNC_CRON`
- `WORKER_NOTIFY_CRON`
- `TELEGRAM_DEFAULT_LOCALE`
- `USE_OLLAMA_ADDRESS_FORMATTER`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

## Local Development

Requirements:

- Node.js 20+
- npm
- PostgreSQL

Install dependencies:

```bash
npm install
```

Push the schema:

```bash
npm run db:push
```

Seed Armenia regions and settlements:

```bash
npm run seed:armenia
```

Run the bot:

```bash
npm run dev:telegram
```

Run the worker:

```bash
npm run dev:worker
```

Build for production:

```bash
npm run build
npm run start:telegram
npm run start:worker
```

## Docker

The repository includes one multi-stage [Dockerfile](Dockerfile) with separate build targets for each runtime process:

- `telegram-bot`
- `worker`
- `tools`

Build images directly:

```bash
docker build --target telegram-bot -t global-outages-telegram-bot .
docker build --target worker -t global-outages-worker .
```

Run with Compose:

```bash
docker compose up --build -d db
docker compose --profile tools run --rm migrate
docker compose up --build telegram-bot worker
```

Compose services in [compose.yaml](compose.yaml):

- `db`
- `telegram-bot`
- `worker`
- `migrate`

Inside Docker, the app containers use:

```env
DATABASE_URL=postgres://postgres:postgres@db:5432/global_outages
```

### ZimaOS / CasaOS

For ZimaOS or CasaOS-style app import, use [compose.zimaos.yaml](compose.zimaos.yaml). It references the published GHCR images directly:

- `ghcr.io/vachagangrigoryan/ena-bot-telegram-bot:latest`
- `ghcr.io/vachagangrigoryan/ena-bot-worker:latest`

The file includes `x-casaos` metadata and is intended for importing as a customized app.

Important:

- there is no web UI for this stack
- you must set `TELEGRAM_TOKEN`
- migrations are still a separate step; run the migration workflow or `npm run db:push` before first use

## CI/CD

GitHub Actions workflows:

- `.github/workflows/pr-checks.yml`
  - runs on pull requests to `master`
  - builds the app
  - runs tests
  - runs `db:push` against a temporary PostgreSQL service
  - verifies both Docker targets build
- `.github/workflows/release-images.yml`
  - runs on push to `master`
  - publishes two GHCR images:
    - `ghcr.io/<owner>/<repo>-telegram-bot`
    - `ghcr.io/<owner>/<repo>-worker`
  - explicitly publishes `:latest` and `:master` on `master`
- `.github/workflows/run-migrations.yml`
  - manual workflow
  - runs schema migration against a real database using `PRODUCTION_DATABASE_URL`

### Migration Strategy

Image publishing and real database migration are intentionally separate.

Recommended flow:

1. open a PR to `master`
2. let CI validate code, schema push, and Docker builds
3. merge to `master`
4. let the release workflow publish the bot and worker images
5. run the manual migration workflow against the target database
6. deploy the new images

## Tests

Run tests:

```bash
npm test
```

Current test coverage includes:

- ENA HTML parsing basics
- Armenian date conversion
- Telegram outage message formatting
- Markdown escaping for user-visible outage content
- deterministic address formatter behavior

## Address Formatting

Default behavior is deterministic and does not depend on any paid model API.

Optional Ollama integration is only used as a fallback when a provider address blob looks too large or too ambiguous to keep as one raw address entry.

Example:

```env
USE_OLLAMA_ADDRESS_FORMATTER=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
```

If Ollama fails, the original deterministic output is preserved.

## Current Scope

Implemented:

- ENA electricity provider support
- Telegram search
- Telegram follow management
- scheduled worker sync and notification processing
- PostgreSQL persistence
- Docker images for bot and worker
- GitHub Actions for PR validation, image publishing, and manual migrations

Not implemented yet:

- water outage providers
- webhook-based Telegram deployment
- advanced settlement-aware search ranking
- a full checked-in SQL migration history beyond generated Drizzle artifacts

## Notes

- The worker and Telegram bot are intentionally separate processes.
- Persistent state lives in PostgreSQL, not in Telegram session state.
- The repository currently contains infrastructure for Armenia seed data, but search is still primarily free-text based.
