# Support Runbook (DRAFT)

For the studio team and whoever looks after the site. Written against the API as frozen at the Backend Gate; the screens named here are the admin console to be built in the frontend phase (every action also exists as an API call, listed in `Frontend_Integration_Guide.md` section 9). Review it with the studio during UAT and replace anything that does not match how they work.

**Read this first: until durable storage is switched on (see section 7), everything the site records is kept in memory and is lost whenever the server restarts. Do not take real orders before that.**

## 1. The daily routine
| When | Check | Where |
|---|---|---|
| Opening | Alert email (`ALERT_EMAIL`): anything overnight? | Inbox |
| Opening | **Dispatch rota** for today: what must leave, by city, who to call, cash to collect | Admin → Dispatch |
| Opening | **Bank transfers waiting** (status "Waiting for payment") against the bank statement | Admin → Orders, filter `awaiting_payment` |
| Morning | **Production board**: personalised gifts to make, soonest delivery first | Admin → Production |
| By 1pm | Same-day orders in Karachi, Lahore, Islamabad and Rawalpindi must be handed to the courier | Dispatch rota (same-day shown first) |
| Afternoon | Inbox (contact form and bulk-gifting enquiries) | Admin → Inbox |
| Afternoon | **Refund queue**: anything due or overdue | Admin → Refunds |
| Closing | Orders marked `dispatched` have courier and tracking filled in | Admin → Orders |

## 2. Handling an order, step by step
| Situation | What to do |
|---|---|
| A bank transfer arrives | Find the order by the number in the payment reference. Move it to **Paid**. The customer is emailed; digital gifts go out by themselves |
| Cash on delivery | Nothing to confirm. After delivery, mark **Delivered**: the payment is then counted as received |
| Start work | Move to **Preparing**. From now the customer can no longer cancel online |
| Making a personalised item | Move to **In production** when work really starts. **After this the order cannot be cancelled**, by the customer or by you. Read the message and card design on the production board |
| Handing to the courier | Move to **Dispatched**, filling in courier and tracking number. The recipient is texted (once SMS is set up) |
| Gift sent by link | The order cannot be dispatched until the recipient has added their address; the system refuses and says so. The rota shows "waiting for address" |
| Delivered | Move to **Delivered** |
| Delivery failed | Move to **Delivery failed**. After the **second** failure the customer is emailed and you get an alert: **call the sender** to decide what next. The first re-delivery in the same city is free; later ones are charged (the amount owed is on the order as `redeliveryFeeDue`, collect it by hand) |
| Customer wants to cancel | Before Preparing: they can do it themselves (order number + email). Later: you may cancel up to Preparing; never once In production. A paid order creates a **refund** automatically |
| Item arrived damaged | The customer reports it within **48 hours** with a photo link. Open Returns → decide: **replacement** or **refund in full including delivery** |
| Customer changed their mind | Within **7 days**, unused, original packaging, **not personalised**, not digital. Approve → when the goods arrive press **Complete** (tick "faulty" if they were: then delivery is refunded too) → a refund is created |
| "I registered but cannot see my earlier order" | Orders placed without signing in are not added to an account automatically (anyone can type an email address). The customer signs in and uses **Add an order** with the order number and email from their confirmation email. You never need to move an order by hand |
| A refund is due | It must be processed within **3 working days** of approval. Send the money (bank transfer lands in 5-7 working days), then press **Process**. Cash-on-delivery customers: ask for their bank details first. Overdue refunds trigger an alert |
| E-gift card / greeting card did not arrive | Look at the order: the gift shows status and last error. The system retries 5 times (2, 4, 8, 16 minutes). If it says **failed**: fix the cause (usually a mistyped address: ask the sender) then **Retry** on the gift |
| Gift link expired unclaimed (30 days) | You and the sender are emailed once. Decide: cancel and refund, or ask the sender to arrange the address another way |
| Wrong amount paid by card | The order stays unpaid and a note says "check before confirming". Compare with the gateway, then act by hand |
| Money arrived for a cancelled order | A note says "refund needed". Create the refund by hand and process it |

## 3. Everyday changes (admin only; effective immediately)
| Change | Where |
|---|---|
| Sargodha (or any city) fee and days; free-delivery limit; 1pm cut-off; same-day capacity per city | Admin → Settings → Delivery. Send the whole table |
| Banner and announcement bar, contact details, bank-transfer instructions | Admin → Settings → Store |
| Promo codes (create, switch off, dates, minimum, first order only) | Admin → Settings → Promo codes |
| Price of an extra (premium wrap etc.) | Admin → Settings → Extras |
| Hide a gift / out of stock | Admin → Catalogue (hide, or set stock to 0) |
| Add or remove a team member | Admin → Team. You cannot remove yourself |
| Someone asks for their data to be deleted | A signed-in customer can delete their own account. For a guest, an admin uses **Erase by email**. Open orders block it; finished orders keep amounts and dates but lose names, addresses and messages |

## 4. Alerts: what they mean
Alerts are emailed to `ALERT_EMAIL` and written to the log with the same words.
| Subject | Meaning | Action |
|---|---|---|
| A digital gift could not be sent | 5 failed attempts | Check the address and the email service, then Retry the gift |
| A refund is overdue | Past its 3-working-day deadline | Process it today |
| Delivery failed twice | Two failed attempts | Call the sender |
| A gift link expired unclaimed | 30 days passed | See section 2 |
| Scheduled job failed: … | The every-minute job threw an error | Developer: read the log around that time |
| (Error webhook) 500 on /api/v1/… | A server fault | Developer: use the request id from the message to find the log line |

## 5. Keeping the site healthy
- **Scheduler.** A job must call `GET /api/v1/internal/scheduler/run` every minute with the header `Authorization: Bearer <CRON_SECRET>`. It sends timed gifts, yearly reminders, expiry notices and overdue-refund alerts, and removes old personal details. If it stops, timed gifts stop. Test it by hand with an admin: `POST /api/v1/admin/scheduler/run`. Vercel's free plan cannot run it every minute (see `Backend_Progress.md`).
- **Uptime check.** Point an uptime monitor at `GET /api/v1/health` (expect 200 and `{"status":"ok"}`); alert if it fails twice in a row.
- **Logs.** One JSON line per request: method, route, status, milliseconds, request id. Search by `requestId` (also shown in every error). Private links and customer details are never in the logs.
- **Errors.** Set `ERROR_WEBHOOK_URL` to a chat webhook to be told about server faults (once a minute per fault).
- **Load.** `npm run load` measures the main journeys. On a laptop one process handled several hundred requests a second with 500 gifts and 2,000 orders. One-process in-memory data is fine for a small studio; see the limits in the Gate report.

## 6. Settings (environment variables)
| Variable | Needed | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | switches on JSON logs and strict checks |
| `JWT_SECRET` | yes | 32+ random characters. The site **will not start** without it. Changing it signs everyone out |
| `CRON_SECRET` | for timed gifts | 16+ characters |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first run | creates the first admin (12+ character password). Remove afterwards |
| `APP_URL` | yes | the storefront address, used in emailed links |
| `CORS_ORIGINS` | yes | storefront and admin origins, comma separated |
| `ALERT_EMAIL`, `ERROR_WEBHOOK_URL` | recommended | where problems go |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` (or `KV_REST_API_*`) | **before real orders** | durable storage. Added automatically by the Vercel integration |
| `GOOGLE_CLIENT_ID` | for Google sign-in | |
| `FEATURE_CARD_PAYMENTS` | later | card also needs a real gateway adapter |
| `RETENTION_DAYS` | optional | finished orders lose personal details after this many days (default 730) |
Never put these in the code or in chat. Rotate `JWT_SECRET`, `CRON_SECRET` and the admin password if one may have leaked.

## 7. Before going live (checklist)
1. Durable storage on (Upstash) and a test order survives a redeploy.
2. A real email sender replaces the logging placeholder, and the sending domain passes SPF/DKIM/DMARC.
3. All settings in section 6 set in Vercel (production), secrets long and random.
4. The scheduler runs every minute (paid cron plan, or an external pinger with the secret).
5. Real catalogue loaded with the import tool (`samples/README.md`), photos in place, real phone number, social links and bank details entered.
6. Delivery table checked line by line against the courier, including Sargodha.
7. Uptime monitor and alert email tested by causing a test alert.
8. A full order of each type placed by the studio on staging: cash on delivery, bank transfer, gift link, digital gift, a cancellation, a return.
9. Privacy and terms pages reviewed (retention period decided).
10. `npm run openapi:check` and the whole test suite pass on the commit being deployed.

## 8. Deploying and rolling back
- Every pull request gets a preview deployment; `main` is staging. Promote to production by hand.
- If a release misbehaves, promote the previous deployment in Vercel: this takes seconds. Data changes made in the meantime are not undone.
- Never change `openapi/openapi.v1.json` by hand. After an intended API change run `npm run openapi`, commit, and tell the frontend team. Version 1 changes only by adding.

## 9. What this system cannot do (yet)
- Keep data safely without durable storage (section 7).
- Take card payments (no gateway chosen).
- Store uploaded photos or product images: they are web links.
- Send texts: a placeholder only logs them.
- Book couriers automatically: staff enter the courier and tracking number.
- Share rate limits between servers: each running copy counts separately.
- Handle thousands of new orders a day: each order rewrites part of a single data file. Plenty for a small studio; the first thing to replace if volume grows.
