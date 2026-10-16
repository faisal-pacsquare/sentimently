# Phase 0 Close-out (14 Oct 2026)

Phase 0 is closed on the project's instruction: studio and Base44 input is not awaited, and storage stays in memory for now. Backend phase B1 has started.

## Exit gate checklist (from the plan)
| Gate item | Result |
|---|---|
| Scope and requirements | Done: 06_Backlog.md, 11_Acceptance_Criteria.md, 02_Business_Rules.md |
| Open questions | Closed by the plan's defaults: 01_Open_Questions.md, 09_Decisions_Log.md |
| Architecture and environments | Done: 04, 08. NestJS API on Vercel, JSON data behind a storage interface, CI workflow, `vercel.json` |
| Designs | Specification only: 10_Design_System_and_Wireframes.md. Visual design files are not produced and are not needed until the frontend starts |
| Vendors | Working choices behind adapters: 05, 09. Gateway paperwork runs outside the build |
| Login-protected pages review | Skipped by decision. The inferred model in 03_Data_Model.md is used |

## Decisions that differ from the original plan
1. **No database.** JSON files behind `JsonStore` / `StorageDriver`, hosted on Vercel.
2. **Storage is in memory for now.** `MemoryDriver` is the default: data starts from `data/` and changes live only until the process restarts. Nothing persists, and each Vercel instance has its own copy. `UpstashDriver` (durable, free tier) is written, tested and switches on when its environment variables are set. `STORAGE_DRIVER=file` keeps changes in the local files.
3. **No Redis or worker.** In-memory cache and rate limiting per instance; scheduled work will use Vercel Cron calling a protected endpoint.
4. Product records reference taxonomy by slug (`sentiments`, `occasions`, `recipients`, `category`) rather than by numeric ids.

## Carried into the backend phase
| Item | Where it is handled |
|---|---|
| Durable storage (Upstash from the Vercel Marketplace) | Before the site takes real orders; at the latest the Backend Gate |
| Customer photo storage | Needs an object store; out of scope until chosen |
| Seed content: the 18 gifts and the 14 / 8 / 6 / 11 taxonomy | `data/products.json` and `data/taxonomy.json` are empty. Entering them is a B1 task and needs the real names and prices |
| Cloud accounts: Vercel project, Upstash, email provider, gateway | When deploying |
| Visual design | Before frontend starts (Week 15) |

## Not done, by decision
- Login-protected pages review.
- Gateway merchant application, courier contract, Sargodha confirmation.
