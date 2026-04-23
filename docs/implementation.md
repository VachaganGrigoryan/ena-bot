# Implementation Notes

This document explains how the current Global Outages TypeScript implementation is structured and how the main runtime flows work.

## High-Level Architecture

There are two runtime entrypoints:

- [apps/telegram-bot/main.ts](/config/workspace/ena/ena-bot/apps/telegram-bot/main.ts:1)
- [apps/worker/main.ts](/config/workspace/ena/ena-bot/apps/worker/main.ts:1)

Both create the shared application service:

- [packages/application/global-outages-service.ts](/config/workspace/ena/ena-bot/packages/application/global-outages-service.ts:1)

The service is the main orchestration boundary. It handles:

- user creation
- subscription CRUD
- outage search
- provider sync
- deduplicated notification processing
- optional address refinement

## Telegram Bot

The Telegram UI lives in [packages/telegram-ui/bot.ts](/config/workspace/ena/ena-bot/packages/telegram-ui/bot.ts:1).

It uses:

- `grammy`
- `@grammyjs/conversations`
- long polling

Implemented Telegram actions:

- `/start`
- find outages
- list subscriptions
- add subscription
- edit subscription
- delete subscription
- pause/resume subscription
- info text

Conversation state is intentionally minimal. Persistent state lives in PostgreSQL, not in the bot session.

## Worker Flow

The worker entrypoint is [apps/worker/main.ts](/config/workspace/ena/ena-bot/apps/worker/main.ts:1).

It wires together:

- `GlobalOutagesService`
- `EnaElectricityProvider`
- a Telegram sender callback backed by `grammy`'s bot API

Worker lifecycle:

1. run an initial sync on startup
2. process notifications immediately after startup sync
3. schedule recurring sync jobs
4. schedule recurring notification jobs

Cron configuration comes from env:

- `WORKER_SYNC_CRON`
- `WORKER_NOTIFY_CRON`

## Provider Pipeline

The provider contract is defined in [packages/domain/provider.ts](/config/workspace/ena/ena-bot/packages/domain/provider.ts:1).

Current ENA implementation:

- [packages/providers/ena/provider.ts](/config/workspace/ena/ena-bot/packages/providers/ena/provider.ts:1)
- [packages/providers/ena/parser.ts](/config/workspace/ena/ena-bot/packages/providers/ena/parser.ts:1)

The ENA flow is:

1. `fetchRaw()`
   - downloads ENA HTML from `ENA_BASE_URL + ENA_OUTAGES_PATH`
2. `parseRaw()`
   - extracts outage dates
   - extracts region headers
   - extracts time slots
   - splits address text into structured entries
3. `normalize()`
   - converts Armenian date text into UTC dates
   - converts provider-specific output into shared outage event/window/location records

The parser is deterministic by default. The code does not depend on paid LLM APIs.

## Address Formatting Strategy

Address formatting abstractions live in:

- [packages/ai/deterministic-address-formatter.ts](/config/workspace/ena/ena-bot/packages/ai/deterministic-address-formatter.ts:1)
- [packages/ai/ollama-address-formatter.ts](/config/workspace/ena/ena-bot/packages/ai/ollama-address-formatter.ts:1)

Selection happens in [packages/application/global-outages-service.ts](/config/workspace/ena/ena-bot/packages/application/global-outages-service.ts:1).

Current behavior:

- deterministic formatter is the default
- Ollama is optional and only used when `USE_OLLAMA_ADDRESS_FORMATTER=true`
- refinement is attempted only for unusually large, suspicious single-address blobs
- if Ollama fails, the original deterministic addresses are kept

This keeps the pipeline stable even when no model is available.

## Storage Model

The Drizzle schema is defined in [packages/storage/db/schema.ts](/config/workspace/ena/ena-bot/packages/storage/db/schema.ts:1).

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

Storage strategy:

- `outage_events` stores provider-level events and raw payloads
- `outage_windows` stores region/time-slot records
- `outage_locations` stores searchable normalized address text
- `notification_deliveries` prevents duplicate sends for the same subscription/window pair

The current model stores both normalized records and raw provider payloads for traceability.

## Repository Layer

Repository classes live under [packages/storage/repositories](/config/workspace/ena/ena-bot/packages/storage/repositories).

Current responsibilities:

- `users.ts`: ensure and fetch users
- `subscriptions.ts`: create/list/update/delete/toggle subscriptions
- `outages.ts`: provider record management, event replacement, and active outage search
- `sync-runs.ts`: record sync lifecycle
- `notification-deliveries.ts`: dedup notification sends

## Armenia Seed Data

Static Armenia geographic data now lives in [packages/data/armenia.ts](/config/workspace/ena/ena-bot/packages/data/armenia.ts:1).

Seeder:

- [packages/storage/seeds/armenia.ts](/config/workspace/ena/ena-bot/packages/storage/seeds/armenia.ts:1)

The seeder:

- creates or updates regions
- creates or updates cities and villages
- creates Yerevan and its districts
- stores region metadata from the dataset

This seed data is not yet used directly for search ranking or settlement-aware matching, but it is ready for that future step.

## Environment

Configuration is centralized in [packages/shared/env.ts](/config/workspace/ena/ena-bot/packages/shared/env.ts:1).

Required:

- `DATABASE_URL`

Required for runtime processes:

- `TELEGRAM_TOKEN`

Optional but useful:

- `ENA_BASE_URL`
- `ENA_OUTAGES_PATH`
- `WORKER_SYNC_CRON`
- `WORKER_NOTIFY_CRON`
- `TELEGRAM_DEFAULT_LOCALE`
- `USE_OLLAMA_ADDRESS_FORMATTER`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

## Known Gaps

The implementation is functional in structure, but there are still project-level gaps:

- no checked-in SQL migration files yet
- no water provider yet
- no webhook deployment path yet
- no advanced matching against seeded settlements yet
- no CI/build verification captured in this repo yet

These are good next steps after basic runtime verification in a full Node environment.
