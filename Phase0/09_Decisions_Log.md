# Phase 0 Decisions Log

Studio and Base44 input is not awaited. Each open question from 01_Open_Questions.md is closed with the plan's stated default. Any decision can be reversed later through the change log; the cost is noted.

## Open questions closed by default

| Q | Decision | Cost to reverse |
|---|---|---|
| Q1 Guest checkout | Allowed. Order tied to an email. Account can be claimed later | Low |
| Q2 Login-protected pages | Build from the inferred model in 03_Data_Model.md | Medium: possible field changes |
| Q3 Gateway / bank transfer | Gateway behind an adapter interface (working choice below). Bank transfer confirmed manually by staff in admin | Low: adapter swap |
| Q4 Urdu | English only. Text kept in plain columns so a language table can be added later | Medium |
| Q5 Express same-day on made-to-order | Not allowed. Per-product allowed-extras list | Low |
| Q6 Base44 export | Not used. The 18 gifts are re-entered from the analysis as seed data in B1 | None |
| Q7 Sargodha | Rs 550, 1–2 working days, editable in StoreConfig | None |
| Q8 Courier model | Studio dispatch rota with manual tracking updates, behind a courier adapter interface | Low |
| Q9 Production states | `placed, paid, preparing, in_production, dispatched, delivered` plus exits `cancelled, failed_delivery, returned, refunded`. Production begins when staff mark "in production" | Low |
| Q10 Same-day capacity | Configurable per city, unlimited at start | None |
| Q11 Retention | Customer photos deleted 90 days after delivery. Deletion on request supported | Low |
| Q12 Contact details | Placeholders hidden until set in StoreConfig | None |
| Q13 Review moderation | Verified-customer reviews publish immediately. Admin can hide | Low |
| Q14 Gift link expiry | 30 days, claimable once | Low |
| Q15 COD scope | Physical orders with a known address only | Low |

## Working vendor choices (adapter pattern: each is replaceable)

| Area | Working choice | Why | Verify before contract |
|---|---|---|---|
| Payment gateway | PayFast (Pakistan) via a `PaymentGateway` interface; Safepay is the substitute | Pakistani-merchant focus | Onboarding time, fees, webhook signing, refund API |
| Courier | None at launch (dispatch rota). `CourierProvider` interface for TCS / Leopards / PostEx later | Avoids a blocking dependency | Same-day coverage and rates |
| Email | Amazon SES behind a `Mailer` interface | Cheap, sends triggered by the cron-called scheduler | Sender-domain setup (SPF, DKIM, DMARC) |
| SMS / WhatsApp | `Messenger` interface, provider chosen in B5. Email-only until then | Template approval takes time | Provider and sender-ID rules |
| Storage / CDN | Product images as static assets on Vercel. Customer photos: undecided (needs an object store, see R1) | Vercel disk is read-only | Free-tier options |
| Identity | Passport.js local + Google OAuth | Per the plan | Google Cloud project |
| Monitoring | Sentry-class error tracking and an uptime checker | Per the plan | Tool pick |
| Hosting | Vercel, serverless | Decided by the project: no budget for infrastructure | Cron limits on the plan, function size |

These are working choices, not contracts. Gateway onboarding paperwork is the one item that needs the business, and it runs in the background; the build does not wait for it (card payments sit behind a feature flag, and the plan's fallback is COD plus bank transfer).

## Architecture decisions
A1–A9 in 04_Architecture_and_API_Conventions.md are adopted as amended for JSON storage and Vercel (A2–A5).

## Technical notes
- **No database (decided 14 Oct 2026).** SQL Server and Prisma were removed. Data is JSON files behind `JsonStore` / `StorageDriver`. Redis and the BullMQ worker are also removed.
- **Storage is in memory for now (14 Oct 2026).** `MemoryDriver` is the default. Writes last until the process restarts and are not shared between Vercel instances, so the live site is effectively read-only until Upstash is switched on.
- **Vercel disk is read-only**, so production writes (orders, accounts, reviews) go to a free Upstash Redis through `UpstashDriver` (risk R1, decided; details and limits in 04_Architecture_and_API_Conventions.md). Create the Upstash database from the Vercel Marketplace and the environment variables are set automatically.
- Scheduled work runs from Vercel Cron calling a protected endpoint, not a worker.
- Customer photo upload still needs an object store; it stays out of scope for production until one is chosen.
