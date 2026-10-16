# sentimently-api

NestJS (TypeScript) API for Sentimently. **No database.** Data lives in JSON files and the app deploys to Vercel.

## Layout
- `src/storage/`: `JsonStore` (collections, atomic read-modify-write) over a `StorageDriver`: `MemoryDriver` (default, not durable), `FileDriver` (`STORAGE_DRIVER=file`), `UpstashDriver` (durable, switches on when its variables are set).
- `src/catalogue/`: products, filters, search, sort, pagination, browse hubs (B1).
- `src/common/`, `src/health/`: error shape, request ids, health check.
- `data/`: seed JSON files (extras, promo codes, store config and delivery rates; products and taxonomy start empty).
- `api/index.js`, `src/vercel.ts`, `vercel.json`: Vercel serverless entry.
- `scripts/check-rule-coverage.mjs`: reports business-rule IDs (Phase0/02) that have no test.

## Run locally
```bash
cp .env.example .env
npm ci
npm run start:dev      # http://localhost:3000/api/v1
npm test            # unit tests
npm run test:e2e    # API tests
```

## Vercel limits that shape the design
- Storage is in memory for now: changes last until the process restarts and are not shared between Vercel instances. To make them durable, add the free Upstash Redis integration in Vercel; `UpstashDriver` then takes over automatically.
- No background processes: scheduled gifts and reminders run from a Vercel Cron call to an endpoint, not a worker.
- Rate limiting is per instance.
See `Phase0/04_Architecture_and_API_Conventions.md` and `Phase0/09_Decisions_Log.md`.

## Scripts
| Command | What it does |
|---|---|
| `npm run start:dev` | run locally with reload |
| `npm test` / `npm run test:e2e` | unit tests / API tests (use `jest --config ./test/jest-e2e.json test/security` to run one suite) |
| `npm run lint` / `npm run build` | style check (also fixes) / compile |
| `npm run openapi` | rewrite `openapi/openapi.v1.json` after an **intended** API change |
| `npm run openapi:check` | fail if the code and the committed contract differ (CI runs this) |
| `npm run postman` | rebuild `postman/` from the contract |
| `npm run load` | load test on synthetic data (`-- --seconds 8 --connections 20`) |
| `npm run import:catalogue -- --taxonomy a.csv --products b.csv [--dry-run]` | load the studio's spreadsheets (see `samples/README.md`) |
| `node scripts/check-rule-coverage.mjs` | every business rule has a test |

## Documents (in the folder above)
`Backend_Gate_Report.md` (state of the backend, launch blockers), `Frontend_Integration_Guide.md`, `Support_Runbook.md`, `Backend_Progress.md`, and `Phase0/` (rules, data model, decisions).
