# Architecture Decision Record and API Conventions

Status: PROPOSED, awaiting tech-lead sign-off.

## Context
Constraint: the project has no budget for a database and deploys to Vercel, so data is kept in JSON files. The prototype is a Base44 app. It repeated the same product query 18 times in one page load, hit HTTP 429, and then reported a missing product ("We could not find that gift"). The production system must stay correct under load and keep orders, payments and stock consistent.

## Decisions

| # | Decision | Reason | Alternative considered |
|---|---|---|---|
| A1 | One NestJS (TypeScript) API with modules, not microservices | Team of 3 on backend. One deployable | Microservices: too much overhead |
| A2 | **JSON files behind a `JsonStore` and a `StorageDriver` interface** (no database) | No database budget. Modules never touch files directly, so a durable driver can replace the file driver later | SQL Server, MongoDB (rejected: cost) |
| A3 | In-memory catalogue cache and per-instance rate limiting | Removes the duplicate-request failure without Redis | Redis (rejected: cost, not available on Vercel) |
| A4 | **Vercel Cron** calls a protected scheduler endpoint (checks `CRON_SECRET`) for timed gifts and reminders | Vercel has no long-running worker | BullMQ worker (needs a persistent process) |
| A5 | Product images in the repo or Vercel static assets. Customer photos need an object store | Vercel disk is read-only | See risk R1 |
| A6 | Passport.js: email/password and Google | Matches the prototype | Hosted identity provider (revisit if needed) |
| A7 | Two React apps (storefront, admin) calling the same API | Per the source plan | |
| A8 | Prerendered browse and product pages for the storefront | SEO for feeling, occasion and category pages | |
| A9 | Server computes all prices (rule PR-07) | Prevents tampering | |

## Data storage on Vercel: what works and what does not
| Need | JSON files on Vercel |
|---|---|
| Catalogue, taxonomy, rates, promo codes (read) | Works. Files ship with the deployment |
| Orders, accounts, wishlist, reviews, reminders (write) | **Does not persist.** The deployed filesystem is read-only. Only `/tmp` is writable, it is wiped between invocations, and it is not shared across instances |
| Two orders racing for the last item | Safe only inside one process. Separate serverless instances do not share the lock |
| Search | Done in memory over the loaded catalogue (fine at this size) |
| Customer photo upload | Needs an object store. Not possible on disk |

**R1: the write-persistence gap. DECIDED (14 Oct 2026): Upstash Redis free tier as a key-value store behind `StorageDriver`.**
- Each collection stays one JSON document (`{ v, docs }`) stored under one key. The data model does not change.
- `UpstashDriver` (src/storage/upstash.driver.ts) talks to Upstash over its REST API with `fetch`. No new dependency.
- Writes are compare-and-set on the version inside Redis, so two serverless instances cannot overwrite each other. The loser reloads and retries (JsonStore, up to 5 attempts). Tested by `upstash.driver.spec.ts`, including the last-item race (PY-03).
- First read of an empty key seeds from the `data/` files. Local development and tests still use plain files; the driver is chosen by environment variables.
- Git-as-database was rejected: every write would be a commit that triggers a redeploy, personal data (addresses, gift messages) would sit in a repository, and it is slow and rate limited.

Known limits to check before relying on it (not verified here; confirm against Upstash's current free plan):
- Daily command and storage caps, and the maximum size of one value or request. A whole collection is one value, so `orders` will outgrow a value limit first. Fix when needed: store orders one key per order plus an index.
- Customer photos are still not storable this way. Keep photo upload out of scope until an object store is chosen.

## Modules (6 API modules + worker)
1. Catalogue: products, taxonomy, search, admin CRUD, images (admin writes need a durable driver, see R1).
2. Identity: customers, auth, roles, wishlist, reminders, reviews.
3. Basket and pricing: gift box, personalisation, pricing engine, promos.
4. Orders and payments: checkout, state machine, payment methods, tracking.
5. Fulfilment: delivery, gift links, couriers, cancellations, returns, refunds.
6. Notifications and digital gifts: email, SMS/WhatsApp, e-gift cards, greeting cards.
7. Scheduler endpoint: a Vercel Cron job calls it each minute. It reads due digital gifts and reminders from the JSON store and sends them.

## Order state machine
`placed → paid (or awaiting_payment for COD/bank transfer) → preparing → in_production (personalised only) → dispatched → delivered`, with `cancelled`, `failed_delivery`, `returned`, `refunded` as exits. Cancellation is allowed up to `preparing` and refused from `in_production` (OR-01, OR-02). Exact states to be confirmed in Q9.

## API conventions
- **Style:** REST, JSON, OpenAPI 3 generated from NestJS decorators. Base path `/api/v1`.
- **Versioning:** the path version changes only on breaking changes. v1 is frozen at the Backend Gate.
- **Pagination:** `?page=1&pageSize=24`. Response `{ data: [], page, pageSize, total }`.
- **Filtering:** `?sentiment=&occasion=&recipient=&category=&type=&minPrice=&maxPrice=&q=&sort=`. Filtering and sorting happen on the server.
- **Money:** integer rupees, field names end with `Amount` or `Price`.
- **Errors (fixes prototype finding 1):** one shape, `{ error: { code, message, details?, requestId } }`.
  - 400 validation, 401/403 auth, 404 only when the thing truly does not exist, 409 conflict, **429 with `Retry-After`**, 5xx server.
  - An empty list is `200` with `data: []`, never an error or a 404.
- **Idempotency:** `Idempotency-Key` header on checkout and payment calls. Keys are stored with the payment record.
- **Caching:** catalogue GETs carry ETag and `Cache-Control` for the Vercel CDN, plus the in-memory store cache. One query per view.
- **Dates:** ISO 8601 in UTC, with the Pakistan time zone (UTC+5) applied for the 1pm cut-off.
- **Auth:** bearer token. Roles: customer, staff, admin.
- **Privacy:** tracking and gift-link endpoints return no personal data beyond what the caller is allowed (OR-07, GL-02).

## Observability
Structured JSON logs with a request id (Vercel logs), error monitoring, uptime checks, and alerts on failed payments, failed scheduled jobs and missed deliveries.

## Consequences
- One deployable keeps early delivery simple.
- No database to buy or run. Every module goes through `JsonStore`, so a database or hosted store can be added later by writing one driver.
- Production writes are not durable until R1 is closed.
- A cron job replaces the worker, so scheduling precision is the cron interval. Check Vercel's current cron limits for the plan in use.
