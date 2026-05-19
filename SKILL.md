---
name: sharefair-trip-settler
description: Work in the sharefair-trip-settler (a.k.a. "Smart Contract") Next.js app — a mobile-first trip expense splitter that tracks shared expenses, generates settlement requests, runs a mock payment authorization flow, and emails reminders. Use this skill whenever the user asks to add, fix, or refactor code in this repo, especially around trips, participants, expenses, line-item splits, payments, settlement requests, reminder cron, receipt PDF extraction, or the Neon/Upstash/local-file storage runtime.
---

# sharefair-trip-settler

Next.js 16 App Router app (JSX, no TypeScript) for splitting trip expenses and settling them through a mock payment provider. Currency is Korean Won (KRW); amounts are stored as **integer minor units** (no decimals).

## Quick map

- `app/` — App Router pages and route handlers.
  - `app/page.jsx` — trip list (home).
  - `app/trip/[id]/`, `app/trip/new/` — trip detail and creation pages.
  - `app/api/trips/`, `app/api/trips/[tripId]/expenses`, `.../settlement-requests`, `.../reminders` — trip CRUD + nested resources.
  - `app/api/payments/{create,callback,webhook,step-up}/` — payment auth, callback from mock provider, webhook, email step-up challenge.
  - `app/api/mock-provider/authorize/` — fake external payment provider used in dev.
  - `app/api/auth/mock-session/` — mock auth (no real identity yet).
  - `app/api/cron/settlement-reminders/` — periodic reminder dispatcher (initial / 3h / 15m).
  - `app/api/receipts/extract/` — PDF → line-item extraction via `pdf-parse`.
- `components/` — client components. `app-shell.jsx` wraps every page; forms live in `components/forms/`.
- `lib/store.jsx` — client trip store: React Context + `useReducer`, syncs via `/api/trips`. Use `useTripStore()` for `trips`, `hydrated`, `error`, and mutators (`createTrip`, `updateTrip`, `deleteTrip`, …).
- `lib/trip-helpers.js` — pure helpers (`formatCurrency`, `getTripTotal`, `getExpenseShares`, balance math). Shared between server and client — keep it framework-free.
- `lib/server/` — server-only modules (`import "server-only"` at top). Repositories, email, payment gateway, storage runtime.
- `db/schema.sql` — canonical schema. **Mirror any schema change in `lib/server/storage-runtime.js#createSchema`** (it idempotently runs the same DDL at boot).
- `test/server-only-stub.js` — vitest aliases `server-only` to this stub so server modules can be unit-tested.

## Storage runtime — dual-mode

`lib/server/storage-runtime.js` selects backends based on env vars:

| Resource | Configured | Fallback |
|---|---|---|
| Postgres | `DATABASE_URL` (Neon serverless) | `local-data-store.js` (file under `.local-data/`) |
| Redis | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`) | in-memory map |

Every repository (`trip-repository.js`, `settlement-repository.js`, `payment-session-store.js`) branches on `isDatabaseConfigured()` / `isRedisConfigured()`. **When adding a persistent field, update both branches and the schema bootstrap.** Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `createSchema` to stay idempotent (see `settlement_requests` for examples).

## Conventions

- **Module system / JSX.** ESM, no TypeScript. React components are `.jsx`. The `@/` import alias points at the repo root (see `jsconfig.json` and `vitest.config.mjs`).
- **Server-only modules.** Files under `lib/server/` start with `import "server-only";`. Don't import them from client components — only from route handlers or other server modules.
- **IDs.** Generated via `randomUUID()` with a prefix (e.g. `trip_…`, `exp_…`, `pay_…`). Use the existing `createId(prefix)` helper pattern, don't roll your own scheme.
- **Money.** Always integer KRW. Round at the boundary with `toNumber` / `Math.round`; never persist floats. Format for display with `formatCurrency` from `lib/trip-helpers.js`.
- **Errors in route handlers.** Throw `Error` with a `.status` property (see `createError(status, message)` in `trip-repository.js`); the route returns `NextResponse.json({ error: e.message }, { status: e.status || 500 })`. Keep that contract.
- **Client store mutations.** Go through `useTripStore()` so the reducer stays the single source of truth. Don't fetch `/api/trips` ad-hoc from components.
- **No new top-level docs/READMEs** unless asked. Don't add comments that just restate the code.

## Running things

```
npm run dev       # next dev
npm run build
npm run lint      # eslint .  (eslint-config-next/core-web-vitals)
npm test          # vitest run
npm run test:watch
```

Tests are colocated as `*.test.js` next to the module (e.g. `lib/trip-helpers.test.js`, `lib/server/payment-gateway.test.js`). Vitest runs in `node` environment with globals enabled.

Without env vars set, the app runs end-to-end against the local file store and in-memory Redis — useful for local UI work and for the mock payment flow.

## Common change patterns

- **New field on a domain object** → update `db/schema.sql`, `createSchema()` in `storage-runtime.js` (with `ADD COLUMN IF NOT EXISTS`), the matching repository's read/write functions in *both* Postgres and local-file branches, and any normalizer (e.g. `normalizeParticipants`).
- **New API route** → place under `app/api/.../route.js`, export `GET`/`POST`/…, delegate to a `lib/server/*-repository.js` function, surface errors via `.status`.
- **New form** → add a client component under `components/forms/`, call store mutators, render inside `<AppShell>`.
- **Payment / settlement state changes** → check the step-up + authorization fields on `payments` and the reminder timestamps on `settlement_requests` before adding new ones; many flows already exist.
