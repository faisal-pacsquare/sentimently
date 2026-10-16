# Backend Gate Report (B6), 14 Oct 2026

**Recommendation: GO for the frontend phase, NOT YET for taking real orders.**
The backend is code-complete, tested, and its API (version 1) is frozen, so the frontend can start building against it now. A short list of things outside the code must be done before the site takes a real order; they are listed in section 6. The sign-off is the technical lead's and the product owner's; this report is the evidence.

## 1. The gate checklist (from the plan)
| Gate item | Status | Evidence |
|---|---|---|
| Every module done | **Met** | B1 to B5 built: catalogue, accounts, pricing and personalisation, orders and payments, fulfilment, plus the admin settings added in B6 |
| Every business rule has a test | **Met, 2 deferred on purpose** | 41 of 43 rules have a named test, checked by `scripts/check-rule-coverage.mjs` in CI. PZ-04 (on-screen read-back of the message) is a frontend rule; PZ-06 (private photo storage) needs an object store that is not chosen |
| API contract frozen as v1 | **Met** | `openapi/openapi.v1.json`: 64 paths, 75 operations (25 public, 16 signed-in, 34 staff/admin), 42 request schemas. `npm run openapi:check` fails CI if the code drifts from the file. Also served at `/api/v1/openapi.json` |
| Postman collection and integration guide | **Met** | `postman/` (75 requests, generated from the contract, and a test replays the first journey with its own bodies). `Frontend_Integration_Guide.md` |
| Load and security tests, fixes done | **Met** (section 3 and 4) | Two performance problems found and fixed; one serious account-takeover design flaw found and fixed |
| Dependency scan | **Met for shipped code** | `npm audit --omit=dev`: 0 vulnerabilities after the NestJS 11 upgrade. 51 advisories (36 high) remain in build and test tooling only; they never reach production, and CI reports them without blocking |
| Monitoring, logs, alerts | **Built, not connected** | JSON request logs, error webhook, alert emails, `/health`. An uptime monitor and the alert address still have to be set up (section 6) |
| Support runbook | **Drafted** | `Support_Runbook.md`, to be reviewed with the studio |
| Content import rehearsal | **Met** | `npm run import:catalogue` with sample sheets and templates; an end-to-end test serves and prices the imported sample |
| **Staging deployed from CI** | **NOT met** | There is no Vercel project and the folder is not a git repository, so the pipeline has never run on a real runner and nothing has been deployed. See section 6 |
| Regression pack in CI | **Built, not yet run on a real runner** | `.github/workflows/ci.yml`: lint, build, unit and API tests, rule coverage, contract check, audit, short load check |

## 2. What was built in B6
- **NestJS 11 upgrade** (clears the shipped-code advisories). All tests passed on it unchanged.
- **Performance fixes** (section 3).
- **Security hardening** (section 4): default-deny access, security headers, CORS allow-list, production secret checks, structured logs without private data, error reporting, request-size and malformed-input handling, and the email-ownership fix.
- **Privacy:** download my data, delete my account, erase by email for support, and automatic removal of personal details from finished orders after the retention period.
- **Gaps closed before freezing the API** (the frontend would have hit these): public store settings (`GET /store`), admin editing of delivery rates, banner, promo codes and extra prices, staff accounts, a retry for failed digital gifts, a confirmation-email flow, and "add an order to my account".
- **Tooling:** OpenAPI contract, Postman collection, catalogue import, load test, route-access sweep.

## 3. Load results
`npm run load` starts the built server on synthetic data (500 gifts, 2,000 existing orders), one process, in-memory store, 20 concurrent connections, production mode.
| Journey | Before | After |
|---|---|---|
| List gifts (page of 24) | 181 req/s, median 99 ms | 350 to 900 req/s, median 17 to 60 ms |
| Filter + budget + sort / keyword search | 113 to 145 req/s, median 137 to 152 ms | 290 to 780 req/s, median 25 to 62 ms |
| One gift | 170 req/s, median 114 ms | 700 to 1,500 req/s, median 12 to 27 ms |
| Price a personalised basket | 134 req/s, median 143 ms | 380 to 910 req/s, median 20 to 50 ms |
| **Place an order (cash on delivery)** | **8 req/s, median 2,011 ms** | **200 to 400 req/s, median 49 to 94 ms** (up to about 550 req/s with 10 connections) |
| Rate limit | | 60 allowed, then 429 with `Retry-After`; no errors, no crashes |

Causes: every read copied a whole collection before filtering, and every write copied the entire orders list to add one order. Fixed by filtering before copying, an id index, and writes that copy only what they change.
**Read these numbers with care.** They come from a shared laptop and the same code varied two to three times between runs, so the table gives ranges. They show that nothing collapses and that the fixes worked (reads roughly 2 to 9 times faster, placing an order 25 to 50 times faster), not what Vercel will deliver. CI uses loose budgets for the same reason.
**Limits that remain** (documented, acceptable for a small studio): each collection is one document, so a write rewrites part of it. That is fine for thousands of orders; with durable storage (one value per collection) the orders collection will reach the size limit of the storage service first, and the fix is one key per order. Rate limits count per running server, not across servers.

## 4. Security review
Method: code review plus tests that attack the API, run automatically. This was **not** an independent penetration test.
| Area | What was checked | Result |
|---|---|---|
| Access control | A test lists every route from the code and checks: only the 25 intended routes are public (a new public route fails the test until someone approves it); every other route refuses anonymous calls and forged, expired, foreign-secret, `alg: none` and unknown-user tokens; every staff/admin route refuses the wrong role | Pass. Roles are read from the stored account on each request, so a demotion or deletion is immediate |
| Privilege escalation | Registering or editing a profile with `role: admin` | Ignored (fields are whitelisted) |
| **Account takeover** | A stranger registers a victim's email address to reach the victim's guest orders; the victim clicks the stranger's confirmation link; Google sign-in or password reset on a squatted address | **Found and fixed.** Guest orders never move on their own; an unconfirmed address is replaced when its real owner registers or uses Google; a password reset evicts a password set by someone else; orders are added by proving the order number + email. 9 attack tests |
| Authentication | Passwords hashed with scrypt; the same answer for a wrong password and an unknown email; reset and confirmation tokens stored only as hashes, single use, time limited; sign-in limited to 10 attempts a minute | Pass |
| Injection and pollution | `__proto__` and `constructor` keys, unknown fields, oversized body (413), malformed JSON (400), all in the normal error shape | Pass. One bug found and fixed: an oversized body was reported as a server fault |
| Output | Security headers (`nosniff`, frame deny, no-content policy, HSTS in production); `Cache-Control: no-store` on private data and on all errors; framework banner removed | Pass |
| Errors | A server fault returns a generic message with a request id, never a stack or detail; faults go to the log and an optional webhook, once a minute per fault | Pass |
| Cross-origin | Only origins in `CORS_ORIGINS` may call from a browser; no credentials | Pass |
| Secrets | Production refuses to start with a missing or weak `JWT_SECRET` (32+ characters), `CRON_SECRET` (16+) or admin password (12+); nothing secret in the repo | Pass |
| Logging | One line per request with the route *pattern*, so private links, ids and emails never appear; lookups by email use POST, not URLs | Pass |
| Payments | Webhook goes through a signature check in the gateway adapter; repeated events apply once; wrong amounts are not accepted; the webhook is exempt from rate limits | Pass (no real gateway exists yet, so the signature check itself is untested) |
| Personal data | Export, self-service deletion, erase-by-email, retention (default 730 days) all tested | Pass |
| Dependencies | `npm audit --omit=dev` | 0 vulnerabilities |

**Not covered, and worth deciding on before launch:**
- Independent penetration test.
- Sign-in tokens last 7 days with no refresh or revocation list (deleted accounts and role changes are honoured at once, but a stolen token works until it expires).
- No lockout after repeated failures other than the per-address rate limit, no bot protection (CAPTCHA) on registration, the contact form or checkout, and no second factor for admin accounts.
- The email-confirmation link cannot tell *who* clicked it. If a victim is tricked into clicking an attacker's link, the attacker's account becomes "confirmed" but still sees none of the victim's data. Residual risk is low.
- E-gift card codes are stored in full so they can be emailed after payment; protect the storage once it is durable.
- Rate limits count per server instance, so a determined attacker spread over many instances gets more attempts.

## 5. Test summary
239 tests, all passing: 42 unit, 197 API (10 suites: platform and catalogue; accounts; pricing; orders and payments; fulfilment, refunds, reports; security; privacy; admin settings; catalogue import; Postman collection). Lint and build clean. Stored data is in memory in every test, so none of them touch real services; Google, email, SMS, the card gateway and the cron service were exercised only through stand-ins.

## 6. What must happen before the first real order
These are not code defects; each needs a decision or an account.
| # | Item | Owner | Why |
|---|---|---|---|
| 1 | **Durable storage on** (free Upstash from the Vercel Marketplace), plus a test order surviving a redeploy | Tech lead | Today all data lives in memory and vanishes on restart. The driver is written and tested against a simulation, **never against real Upstash**; its free-plan size and request limits are unchecked |
| 2 | Create the Vercel project, set the environment variables, deploy staging from CI, and watch the pipeline pass on a real runner | Tech lead | The "staging deployed from CI" gate item |
| 3 | A real email sender (Amazon SES or similar), sending domain set up | Tech lead | Everything emailed (confirmations, resets, gifts) is only logged today |
| 4 | Scheduler running every minute (a paid Vercel cron plan, or a free external pinger with `CRON_SECRET`) | Tech lead | Timed gifts, reminders, expiry notices, retention. Without it, timed gifts never send |
| 5 | Payment gateway: choose, apply, build the adapter, test with its sandbox | Product owner + tech lead | Card is switched off; cash on delivery and bank transfer work |
| 6 | Real content: the gifts, the 14/8/6/11 groups, photos, the real 8 relationships, 4 card designs, 8 starter lines, contact topics, phone number, social links, bank details | Studio | The catalogue is empty and several lists are my placeholders |
| 7 | Object store for images and customer photos | Tech lead | Admin images and damage photos are web links only; personalisation photos do not exist |
| 8 | SMS/WhatsApp provider | Tech lead | Delivery texts only log |
| 9 | Courier: confirm Sargodha fee and days; decide rota or API | Studio | The Sargodha value is a stand-in |
| 10 | Policies: retention period, privacy and terms pages, working days (assumed Mon to Sat), the assumptions listed in `Backend_Progress.md` | Product owner | |
| 11 | Uptime monitor on `/health`, alert email and error webhook set and tested | Tech lead | |
| 12 | Decide on the security items in section 4 "not covered" | Tech lead | |

## 7. Open assumptions the frontend should know
- Images are URLs; there is no upload.
- Response bodies are not in the OpenAPI file (only requests); `Frontend_Integration_Guide.md` documents them.
- Guest orders are added to an account with the order number and email, not automatically.
- The relationship names, card designs, starter lines and contact topics are placeholders.
- Search is a simple "contains" match over name and description, done in memory.

## 8. Decision requested
Approve the gate so frontend work can start from `openapi/openapi.v1.json`, with the twelve items above tracked as launch blockers and an agreed owner and date for each. Changes to v1 from here are additive only and go through `npm run openapi` and the contract check.
