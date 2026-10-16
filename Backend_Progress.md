# Backend Progress

Repo: `sentimently-api/`. Storage is in memory for now (see Phase0/12_Phase0_Closeout.md).
Checks run on every change: `npm run lint`, `npm run build`, `npm test` (42 unit), `npm run test:e2e` (197 API tests). 41 of the 43 business rules have a test (2 deferred on purpose).

| Phase | Status | Notes |
|---|---|---|
| B1 Platform and catalogue | Built, except seed content | Product/taxonomy files are empty until the real gifts are supplied |
| B2 Identity and engagement | Built | See below |
| B3 Pricing and personalisation | Built, with open items | See below |
| B4 Orders and payments | Built, with open items | See below |
| B5 Fulfilment and gifting | Built, with open items | See below |
| B6 Hardening and Backend Gate | Done: recommendation GO for frontend, NOT YET for real orders | See `Backend_Gate_Report.md` |

## B2: what exists
| Story | Endpoint(s) |
|---|---|
| E3-1 Register, sign in, reset password | `POST /auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` |
| E3-2 Google sign-in | `POST /auth/google` (needs `GOOGLE_CLIENT_ID`) |
| E3-3 Profile and wishlist | `GET/PATCH /me`, `GET /me/wishlist`, `PUT/DELETE /me/wishlist/:productId` |
| E3-4 Occasion reminders (data and CRUD) | `/me/reminders` (sending comes in B5) |
| E3-5 Reviews and moderation | `GET/POST /products/:slug/reviews`, `GET/PATCH /admin/reviews` |
| E3-6 Roles | customer, staff, admin; every route is private unless marked `@Public()` |
| E8-3 / E8-2 Contact and bulk enquiries | `POST /contact`, `GET/PATCH /admin/contact` |
| E2-5 Admin catalogue | `/admin/products`, `/admin/taxonomy` (image files not yet: images are URLs) |

## B3: what exists
| Story | Endpoint |
|---|---|
| E4-1 Gift box | Stateless: the frontend keeps the box and sends it to `POST /quote`. Works for guests and needs no stored cart |
| E4-2 Personalisation | Name (required), relationship, message up to 900 characters, card design, paid extras; `GET /personalisation/options` for the studio |
| E4-4 Server pricing | `POST /quote` returns lines, extras, delivery fee, promo discount and total. Client prices are ignored |
| E4-5 Dates | Same-day cut-off 1pm Pakistan time, made-to-order lead time, daily same-day capacity, 3-day limit for flowers and chocolate |

Problems come back together as a 400 with `error.details` (a list of messages like `Line 2: only 3 of "x" left`).
`POST /quote` is public. If the caller sends a token it is used for first-gift codes; guests can give an email instead.

## Assumptions made in B3 (change in rules.ts / pricing.service.ts)
- Working days are Monday to Saturday; Sunday is closed and never a same-day.
- Free delivery and the promo minimum look at items plus extras before the discount, and "over" means strictly more (Rs 5,000 still pays, Rs 5,001 is free; Rs 3,000 fails HELLO10, Rs 3,001 works).
- Promo takes 10% off items and extras, not delivery, rounded to the nearest rupee.
- A personalised gift is its own line (quantity 1) and extras belong to the personalisation. Digital gifts are personalised in the send flow (B4), not the studio.
- A gift is perishable if flagged so, or if a chocolate box is added. A product with its own allowed-extras list uses exactly that list; otherwise all active extras except express same-day on made-to-order gifts.
- Gift-link orders still need a delivery city from the sender, so the fee is known.
- The delivery date it offers is the safe one: after the longest lead time in the box, then the courier time.
- The 8 relationships, 4 card designs and 8 starter lines are placeholders; the prototype's real ones were not captured.
- Photos for personalisation are not built (they need an object store).

## Contract for B4 (orders), additions
Same-day capacity counts `orders` with `city`, `deliveryDate` (starts with the date) and a status other than `cancelled`. First-gift codes treat any `orders` row of that `customerId` that is not `cancelled` as a previous order. Checkout must call the same pricing service again before taking payment.

## B4: what exists
| Story | Endpoint(s) |
|---|---|
| E5-1 Place an order (guests allowed) | `POST /checkout` (optional `Idempotency-Key` header) |
| E5-2 Cash on delivery | `paymentMethod: "cod"`: known address, physical gifts only |
| E5-3 Bank transfer | `paymentMethod: "bank_transfer"`: waits as `awaiting_payment`; staff confirm by moving it to `paid` |
| E5-4 Card | `paymentMethod: "card"` and `POST /payments/webhook`. Needs `FEATURE_CARD_PAYMENTS=true` and a real gateway adapter (none yet) |
| E5-5 Tracking | `POST /orders/track` (number + email; status and dates only) |
| My orders | `GET /orders`, `GET /orders/:number` (signed in) |
| E5-6 Emails | Confirmation at checkout; status emails for paid, dispatched, delivered, failed delivery, cancelled, refunded |
| E5-7 Staff queue | `GET /admin/orders` (filters: status list, city, q, dates), `GET /admin/orders/:id`, `POST /admin/orders/:id/status`, `GET /admin/production` |
| E6-1 / E6-2 Digital gifts | Lines with a `digital` block (recipient email, message, optional `sendAt`); emailed when the order is paid; digital-only orders finish by themselves |
| SC-03 Gift card check | `POST /gift-cards/check` |
| Gift link (creation only) | `deliveryMethod gift_link`: link returned to the sender and emailed; only its hash is stored. Claiming is B5 |

Order statuses: awaiting_payment, placed (cash on delivery), paid, preparing, in_production, dispatched, delivered, failed_delivery, returned, refunded, cancelled. Moves are checked by `order-state.ts` (OR-01, OR-02).

## Assumptions made in B4
- Cancelling is allowed up to and including `preparing`; never from `in_production` on. The customer-facing cancel and refund flow is B5; today only staff move orders.
- A repeated checkout with the same Idempotency-Key and email returns the first order.
- Stock is taken in one step at checkout (all or nothing) and put back when an order is cancelled. Made-to-order gifts do not use stock.
- A guest checkout creates (or reuses) a guest customer record by email. If a registered account has that email, the order shows in that account.
- Card: if the gateway cannot start the payment, the order is cancelled and stock returned. A payment for the wrong amount is flagged and not accepted. A payment that arrives after cancellation is flagged "refund needed".
- E-gift card codes are stored in full (so they can be emailed after payment) and are never shown to staff beyond the last 4 characters. Protect storage when it becomes durable.
- A code check tells whether a code exists and has not expired. Using a code to pay is not built.
- Bank details come from `storeConfig.bankTransferInstructions` (not in the seed yet). Same-day delivery still has no per-slot booking: two simultaneous checkouts could both take the last same-day slot.
- The real payment gateway is not chosen, so card payments cannot be used yet. `NullGateway` is installed; a real adapter implements `PaymentGateway`.

## Contract for B5 (fulfilment)
Gift links: `giftLinks` documents have `orderId`, `tokenHash` (SHA-256 of the token), `isClaimed`, `expiresAt` (30 days). Scheduled digital gifts: `digitalGifts` with `status: "scheduled"` and `sendAt`; the scheduler sends them and, for digital-only orders, moves the order to `delivered` once all are sent. Customer cancellation and refunds must use `OrdersService.transition`.

## B5: what exists
| Story | Endpoint(s) |
|---|---|
| E7-1 Gift links | `GET /gift-links/:token` (preview), `POST /gift-links/:token/claim` (public; the long link is the key) |
| E6-3 / SC-02 / SC-04 Scheduled gifts | Scheduler sends gifts at their minute, retries failures with growing waits, gives up after 5 and raises an alert |
| E8-1 Occasion reminders | Sent by the scheduler at 09:00 Pakistan time, `notifyDaysBefore` days ahead, every year, once per occasion |
| E7-3 Cancellation | `POST /orders/cancel` (number + email): free before preparation; staff can cancel later with `POST /admin/orders/:id/status` |
| E7-4 Returns and refunds | `POST /orders/returns`; staff: `GET /admin/returns`, `POST /admin/returns/:id/decision`, `.../complete`; `GET /admin/refunds`, `POST /admin/refunds/:id/process` |
| E7-5 Failed delivery | Two failed attempts alert the studio and email the sender; first re-delivery free, later ones recorded as `redeliveryFeeDue` |
| E7-6 SMS / WhatsApp | A `Messenger` interface; texts go to the delivery phone when an order is dispatched or a delivery fails. Logs only for now |
| E7-2 Dispatch | `GET /admin/dispatch?date=&city=`: the day sheet by city, with address, phone, courier, tracking and cash to collect. Courier and tracking are entered on the order |
| E8-4 Reports | `GET /admin/reports/summary?from=&to=`: sales, by status / payment / city, delivery performance, promo use, top gifts, refunds |
| E8-2 Bulk gifting | Enquiries arrive through the contact form (B2) with topic `bulk_gifting` and are worked in the admin inbox |
| Scheduler | `GET /internal/scheduler/run` (needs `CRON_SECRET`), `POST /admin/scheduler/run` (admin) |

## Turning on the scheduler (Vercel)
Set `CRON_SECRET` (and `ALERT_EMAIL`) in Vercel, then add this to `vercel.json`:
```json
"crons": [{ "path": "/api/v1/internal/scheduler/run", "schedule": "* * * * *" }]
```
Vercel's free (Hobby) plan only allows a cron job once a day, and a faster schedule makes the deployment fail. A gift set for a particular minute needs the every-minute schedule, so either use a paid plan or point a free external pinger at the URL with the header `Authorization: Bearer <CRON_SECRET>`. This is why it is not in `vercel.json` yet.

## Assumptions made in B5
- A gift-link recipient gives address and phone only; the delivery city stays the one the sender chose (the fee was already charged for it).
- Link expiry is 30 days; the sender and the studio are told once when one expires unclaimed. The studio decides what happens next.
- Cancelling is free before `preparing`. Later cancellations are staff-only, and never once in production (OR-02).
- A cancelled order that was already paid gets a refund task due in 3 working days (Mon to Sat). Cash-on-delivery refunds need the customer's bank details, which staff ask for.
- Damage claims: photos are links for now (file upload needs an object store). The refund is the whole order including delivery; staff choose refund or replacement.
- Returns: items only, no delivery fee, unless staff mark the goods faulty. An order discount is shared across the returned items. One request per order (a rejected one can be retried).
- A partial refund leaves the order as `returned`; only a full refund moves it to `refunded`.
- Re-delivery fee uses the delivery rate of the order's city and is recorded, not collected automatically.
- "Sales" in reports means orders that are not unpaid, cancelled, returned or refunded (so cash-on-delivery orders count when placed).
- Courier integration is not built: the studio rota is the plan for launch. Tracking details are typed in.

## Security choices
- Passwords: scrypt with a random salt per password. Reset tokens are random and only their SHA-256 is stored; one use, one hour.
- Login and forgot-password give the same answer whether or not the email exists.
- Role is read from the stored customer on every request, not trusted from the token.
- Sign-in endpoints allow 10 attempts a minute per address, the contact form 5. Behind Vercel the proxy header is trusted (`VERCEL` or `TRUST_PROXY` set).
- Clients cannot set `id`, `rating`, `reviewCount` or other server fields: the validation pipe strips them.
- The app refuses to start in production without `JWT_SECRET`.

## Differences from the plan
- No Passport.js: a small global guard plus `@nestjs/jwt` does the same job with less code.
- No refresh tokens yet: one token valid 7 days (`JWT_EXPIRES_IN`).
- Reset and other emails go through a `Mailer` interface; today it only logs and keeps mail in memory. Amazon SES is the planned real sender.
- Contact topics are assumed (order, delivery, payment, personalisation, bulk_gifting, other); the prototype's six topic names were not captured.
- Google sign-in is tested with a stub; it has not been tried against real Google.

## Contract for B4 (orders)
Reviews treat a gift as bought when an `orders` document has `customerId`, a `status` of paid, preparing, in_production, dispatched or delivered, and `lines[].productId`. B4 must create orders in that shape. Guests are `customers` documents with `isGuest: true`; checkout should create or reuse one by email.

## Open items
- Seed content (18 gifts, 14/8/6/11 groups) and photographs.
- Durable storage (Upstash) and photo storage, before taking real orders.
- Real email sender.

## B6: hardening and the Backend Gate
Full evidence, load numbers, the security review and the launch blockers are in **`Backend_Gate_Report.md`**. Other deliverables:
`Frontend_Integration_Guide.md`, `Support_Runbook.md` (draft), `sentimently-api/openapi/openapi.v1.json` (frozen contract), `sentimently-api/postman/`, `sentimently-api/samples/` (catalogue import).

What changed in the code in B6:
- NestJS 11; shipped dependencies have 0 known vulnerabilities.
- Faster storage: reads filter before copying, lookups by id use an index, writes copy only what they change (`appendIf`, `mutateByIds`). Placing an order went from 8 to 200+ per second in the load test.
- Security: default-deny route access checked by a test over every route; security headers; CORS allow-list (`CORS_ORIGINS`); production refuses weak secrets; JSON request logs with route patterns only; error reporting webhook; oversized and malformed bodies handled.
- **Account-takeover fix.** Registering an email no longer reveals guest orders placed with it. Guest orders stay with a guest record; a signed-in customer adds one with `POST /me/claim-order {number,email}`. Unconfirmed registrations are replaced by the address's real owner (register or Google); a password reset evicts a stranger's password. New: `POST /auth/verify-email`, `POST /auth/resend-verification`, `emailVerified` on the customer.
- Privacy: `GET /me/export`, `DELETE /me`, `POST /admin/privacy/erase`, retention of finished orders (`RETENTION_DAYS`, default 730) run by the scheduler.
- Admin and storefront gaps closed: `GET /store`, `GET/PATCH /admin/store`, promo codes, extras, staff accounts, `POST /admin/digital-gifts/:id/retry`.
- Tooling: `npm run openapi` / `openapi:check`, `postman`, `load`, `import:catalogue`.

Assumptions added in B6: retention period 730 days (a policy decision for the studio); the payment webhook is exempt from the rate limit because every call is signature-checked; unconfirmed email addresses are not treated as owned by anyone.
