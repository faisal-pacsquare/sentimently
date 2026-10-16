# Environments, CI/CD and Observability Plan

## Repositories
- `sentimently-api` (NestJS, includes worker)
- `sentimently-storefront` and `sentimently-admin` (created at the Backend Gate; not started before)
- `sentimently-infra` (infrastructure as code, pipeline definitions)

## Branching
Trunk-based with short-lived feature branches. Pull requests need one review and a green pipeline. `main` always deploys to staging.

## Environments
| Env | Purpose | Data |
|---|---|---|
| Local | `npm run start:dev` with JSON files in `data/`; optional Docker Compose for a mail catcher only | Seed data |
| Dev | Shared integration, auto-deploy from `main` | Seed data |
| Staging | Production-like, used for gates and UAT | Anonymised copy and imported catalogue |
| Production | Live | Real |

## CI pipeline (per pull request)
1. Install, lint, type check.
2. Unit tests and business-rule tests (02_Business_Rules.md).
3. Integration tests against temporary JSON data directories.
4. Seed-data check: every `data/*.json` file parses.
5. Dependency and secret scan.
6. Build, publish OpenAPI document as an artifact.

## CD
Vercel deploys every pull request as a preview and `main` as staging. Production is a manual promotion, and Vercel can roll back to the previous deployment. Changes to seed JSON in `data/` ship with the deployment.

## Secrets and config
Secrets live in Vercel environment variables, never in the repo. Per-environment config via environment variables. Gateway, email and courier keys are separate for test and live.

## Observability
- Structured JSON logs with request id.
- Error monitoring on the API and the cron-called scheduler endpoint.
- Uptime checks on health endpoints.
- Alerts that page someone: failed payment webhooks, failed or late scheduled jobs, error rate, missed delivery SLA.
- Backups: the seed JSON lives in Git. For any durable runtime store, schedule an export.

## Week 1–3 tasks
| Task | Owner | Done when |
|---|---|---|
| Create the Vercel project and environment variables | Tech lead | Preview deployment reachable |
| Create repos and branch protection | DevOps | PR rules enforced |
| Local run on seed JSON | Backend dev | `npm run start:dev` serves the API with no other services |
| Pipeline skeleton | DevOps | Empty app builds and tests in CI |
| Preview and staging deployed | DevOps | Health endpoint reachable |
