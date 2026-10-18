# CLAUDE.md

Guidance for working in this repository. Read it before changing code.

## What this is

**Bloomora** (the code and repo still say "sentimently") is an online gift store for Karachi: a customer **shop**, a staff **studio console** (admin), and a NestJS **API**. Shoppers browse gifts by feeling, occasion, recipient or category, search as they type, personalise a gift (message, card design, packaging), and pay by cash on delivery, bank transfer or card (Safepay, behind a feature flag). Staff run orders, production, dispatch, returns, reviews, the catalogue (with photo uploads and spreadsheet import), settings and the team.

Digital gifts (e-gift and greeting cards) exist in the API and studio but are **not sold on the shop**: the storefront asks for posted gifts only.

## Repository layout

This folder (`sentimently/`) is the one git repository and the canonical copy. Older sibling folders next to it are stale: do not edit them.

```
sentimently/
  sentimently-api/        NestJS 11 API (TypeScript, Express 5)
    src/                  one folder per area: auth, catalogue, orders, pricing, fulfilment, digital, images,
                          mail, messaging, reviews, me, privacy, store, admin, alerts, health, storage, common
    data/                 seed JSON (taxonomy, products, extras, promoCodes, storeConfig)
    test/                 end-to-end specs (*.e2e-spec.ts); unit specs sit beside the code (*.spec.ts)
    scripts/              demo-catalogue/ (Python generator), upload-photos.mjs, copy-seed.mjs, make-postman.mjs
    samples/              demo CSVs; new-gifts/ holds the spreadsheets for the ribbon/gajray/chocolate gifts
    openapi/, postman/    generated API contract and Postman collection (committed)
  sentimently-web/        npm workspaces
    apps/storefront/      the shop (React 19, Vite 7, React Router 7, TanStack Query 5)
    apps/admin/           the studio console (same stack)
    packages/api/         typed API client shared by both apps
    packages/ui/          shared components, design tokens, logo
  samples/cards/          the anniversary greeting card image
  .github/workflows/      ci.yml (api, web, smoke) and scheduler.yml (10-minute scheduler)
  DEPLOYMENT.md           step-by-step Vercel deployment and operations guide (keep it current)
  Support_Runbook.md, Safepay_Sandbox_Checklist.md, Backend_*.md, Frontend_Integration_Guide.md  background docs
```

## Commands

Run API commands in `sentimently-api/` and web commands in `sentimently-web/`.

API:

| Task | Command |
|---|---|
| Dev server (port 3000, watch) | `npm run start:dev` |
| Build (also copies seed data into `dist/data`) | `npm run build` |
| Unit tests / end-to-end tests | `npm test` / `npm run test:e2e` |
| One e2e file | `npm run test:e2e -- search-suggest` |
| Lint (check only / fix) | `npm run lint:check` / `npm run lint` |
| Regenerate the API contract, then Postman | `npm run openapi` then `npm run postman` |
| Verify the contract matches the code | `npm run openapi:check` |
| Import catalogue CSVs into `data/` (strict) | `npm run import:catalogue -- --taxonomy a.csv --products b.csv [--dry-run]` |
| Bulk-upload real photos to gifts | `npm run photos:upload -- --api https://HOST/api/v1 --folder ./photos [--dry-run]` |

Web:

| Task | Command |
|---|---|
| Shop dev server (5173) / studio dev server (5174) | `npm run dev` / `npm run dev:admin` |
| Typecheck / lint / test / build (all workspaces) | `npm run typecheck` / `npx eslint .` / `npm test` / `npm run build` |

The Vite dev servers proxy to the API; run the API first. Locally, copy `sentimently-api/.env.example` to `.env`; it never goes to GitHub. Set `JWT_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (creates the first admin if none exists), `APP_URL=http://localhost:5173`, and raise `RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT` for development.

**Before saying a change is done, run:** API `lint:check`, `build`, `test`, `test:e2e`, plus `openapi` and `postman` if any route changed; web `typecheck`, `eslint .`, `test`, `build`. CI runs the same.

## Architecture

- **Storage** is a `JsonStore` over a driver that loads and saves a whole collection (`taxonomy, products, extras, customers, reviews, wishlists, reminders, promoCodes, orders, payments, giftLinks, digitalGifts, contactMessages, returns, refunds, storeConfig`). Drivers: Memory (default, tests), File (`STORAGE_DRIVER=file`, local only, writes into `data/`), Upstash Redis (production). Writes go through `mutate`, `mutateByIds`, `update`, `insert`, `remove`, which guard against concurrent writes.
- **Seeding:** a collection is filled from `data/*.json` only the first time it is read from an empty store. Changing `data/` therefore does **not** change a live database. To put new gifts into a live shop use the studio's **Catalogue → Add from a spreadsheet**.
- **Auth:** JWT; default-deny global guard. Roles are `customer`, `staff`, `admin`. Routes are private unless marked `@Public()`; `@Roles(...)` narrows them. Admin-only: permanent deletes (gifts, reviews, cancelled orders, groups), settings, team. Staff can hide gifts and manage the catalogue.
- **Errors** use one shape: `{ error: { code, message, details?, requestId } }`. Validation problems come back as `details` (a list of plain-language strings).
- **Money** is whole rupees (integers). The server prices everything; the client never sends prices.
- **Order statuses:** `awaiting_payment, placed, paid, preparing, in_production, dispatched, delivered, failed_delivery, returned, refunded, cancelled`. Cancelling restores reserved stock. Only cancelled orders can be deleted.
- **Photos:** an `ImageStore`: Vercel Blob in production (`BLOB_READ_WRITE_TOKEN`, or any `*_READ_WRITE_TOKEN`), a local `uploads/` folder when not on Vercel, and a clear 503 on Vercel without a token. Uploads are checked by magic bytes (JPEG, PNG, WebP, GIF), 4 MB limit. Removing a photo from a gift deletes the file it owns.
- **Email:** `Mailer` with Console (default; only logs), Brevo and Resend. `AdminNotifier` sends staff alerts (contact form, return requests). `GET /api/v1/health` reports `store`, `mail` and `images` so a half-configured deploy is visible.
- **Search:** `GET /products?q=` matches every word in any order; `GET /search/suggest?q=` feeds the header autocomplete (gifts and groups, public).
- **Payments:** COD and bank transfer work. Card goes through Safepay's hosted checkout and a signed webhook; several details are marked VERIFY in `Safepay_Sandbox_Checklist.md` and need real sandbox keys. Gated by `FEATURE_CARD_PAYMENTS`.
- **Scheduler:** `/internal/scheduler/run`, called by Vercel Cron daily and by GitHub Actions every 10 minutes (needs `CRON_SECRET` and the `API_URL` variable).

## Conventions that matter

- **Contract is frozen.** Any added or changed route needs `npm run openapi` and `npm run postman`, committed. `test/security.e2e-spec.ts` holds an allowlist of public routes: add a route there only on purpose.
- **A failed request is never shown as "not found".** Pages show an error with a retry; only a real 404 is "not found".
- **Accessibility and mobile:** interactive targets at least 44px, labelled controls, works at phone width (shop and studio both). New pages open at the top (`ScrollToTop`).
- **Frontend tests** use Vitest, Testing Library and msw with unhandled requests set to **error**: add a handler for any new endpoint (shop defaults live in `apps/storefront/src/test/server.ts`).
- **Destructive actions** ask first. Permanent deletes are admin-only, hiding is the reversible alternative, and the studio says what goes with the record.
- **Style:** TypeScript strict, Prettier and ESLint enforced, tokens in `packages/ui` (ivory, plum, rose, gold; Fraunces and Inter). Match the surrounding code and comment density.
- **Never commit secrets.** `.env`, tokens, API keys and passwords stay out of the repo and out of chat.
- Windows is the development machine: use forward slashes in shell commands, and watch line endings (`.gitattributes` is set).

## Catalogue content

- Demo content comes from `sentimently-api/scripts/demo-catalogue/` (`groups.py`, `items.py`, `build.py`). Run `python scripts/demo-catalogue/build.py` to rewrite the demo CSVs and the SVG illustrations in `sentimently-web/apps/storefront/public/images/demo/`, then `npm run build` and `npm run import:catalogue -- --taxonomy samples/demo-taxonomy.csv --products samples/demo-products.csv` to refresh `data/`.
- The demo pictures are placeholders. Real photos are uploaded in the studio (a gift's **Photos** panel) or in bulk with `photos:upload`. Use only photos the shop owns; do not reuse other sellers' images.
- A gift's slug is its web address and its photo file name stem (`slug_1.jpg`). Slugs and group slugs cannot change after creation.

## Deploying

Three Vercel projects from one GitHub repo (root directories: `sentimently-api`, `sentimently-web/apps/storefront`, `sentimently-web/apps/admin`), region `bom1`. The API runs as a serverless function (`api/index.js` → `dist/vercel`). Production needs durable storage (Upstash), a real `JWT_SECRET`, and `MAIL_FROM` when an email key is set; the app refuses to start otherwise. Full steps, email and photo setup, the admin password reset (`ADMIN_RESET`) and rollback are in `DEPLOYMENT.md`.

A deploy is healthy when `/api/v1/health` shows `"store":"UpstashDriver"`, `"mail":"brevo"` (or `resend`) and `"images":"blob"`.

## Known gaps

Safepay needs sandbox verification with real keys; card refunds are manual; abandoned card payments have no expiry job; Google sign-in needs a client ID; no pre-rendering or SEO work; real catalogue content, photos and legal pages are still to be written; uptime monitoring and backups are not set up. See `DEPLOYMENT.md` ("What is not ready yet").
