# Frontend Integration Guide (API v1)

For the storefront and admin console developers. The machine-readable contract is `sentimently-api/openapi/openapi.v1.json` (also served at `/api/v1/openapi.json`), and `sentimently-api/postman/` has a collection that runs every request. The OpenAPI file describes **requests** precisely; it does not describe response bodies, so the response shapes you need are below.

## 1. Basics
| | |
|---|---|
| Base URL | `https://<your-domain>/api/v1` (local: `http://localhost:3000/api/v1`) |
| Format | JSON in, JSON out. Send `Content-Type: application/json` |
| Money | Whole rupees (integers), currency `PKR`. Never send a price: the server decides every amount |
| Dates | Timestamps are ISO 8601 UTC (`2026-11-18T05:00:00.000Z`). Delivery dates are plain dates in Pakistan time (`2026-11-18`) |
| Auth | `Authorization: Bearer <token>` from login/register/Google. Tokens last 7 days; there is no refresh yet, so send the person back to sign in on 401. A deleted account or a role change takes effect on the next request |
| Roles | `customer`, `staff`, `admin`. Each operation in the OpenAPI file has `x-access`: `public`, `signed-in`, or `roles: staff, admin` |
| Cross-origin | The API only answers browsers on origins listed in its `CORS_ORIGINS` setting. Give the backend your storefront and admin origins |
| Ids you can show | Order number (`SN-7K3M9Q2X`), product `slug`. Internal `id`s are for API calls |

Send an `X-Request-Id` header if you like; it is echoed back and appears in every error. Show it on error screens so support can find the request.

## 2. Errors and limits (build one handler for all of it)
Every failure has the same shape:
```json
{ "error": { "code": "validation_error", "message": "The request is not valid.", "details": ["Line 1: only 3 of \"Photo Book\" left"], "requestId": "…" } }
```
| Status | `code` | What to do |
|---|---|---|
| 400 | `validation_error` | Show `details` (a list of plain sentences) next to the form. A basket problem lists **all** problems at once |
| 401 | `unauthorized` | Not signed in or the token expired: go to sign-in |
| 403 | `forbidden` | Signed in but not allowed (e.g. a customer on an admin page) |
| 404 | `not_found` | Really does not exist. A failed lookup is **never** reported as 404 (the prototype's biggest bug) |
| 409 | `conflict` | A state problem: sold out at the last moment, already claimed, cannot cancel now. `message` is customer-ready |
| 410 | | A gift link has expired |
| 413 | `payload_too_large` | |
| 429 | `rate_limited` | Wait `Retry-After` seconds, then retry. Show a calm "please wait a moment" |
| 5xx | `internal_error` | Show a retry state, never "not found" or an empty list |

An empty list is `200` with `data: []`. Limits per minute per address: general 120, sign-in 10, contact form 5, checkout 20, order lookups 10, gift-card code checks 10, gift links 20.

## 3. Reading the catalogue (public, cacheable for a minute)
```
GET /products?sentiment=i-miss-you&occasion=&recipient=&category=&type=physical|digital
             &minPrice=&maxPrice=&q=&sort=popularity|price_asc|price_desc|rating|newest&page=1&pageSize=24
GET /products/:slug
GET /taxonomy/sentiments | occasions | recipients | categories        -> groups with productCount
GET /taxonomy/:kind/:slug                                              -> { hub, products }
GET /store                                                             -> announcement, rates table, contact, payment methods
GET /personalisation/options                                           -> studio choices
```
Product (`data[]` item and single product):
```json
{ "id": "…", "slug": "photo-mug", "name": "…", "description": "…", "price": 1200, "offerPrice": 999, "effectivePrice": 999, "onOffer": true,
  "type": "physical", "digitalKind": null, "stock": 25, "isMadeToOrder": false, "leadTimeMinDays": null, "leadTimeMaxDays": null,
  "isPerishable": false, "rating": 4.6, "reviewCount": 12, "imageUrls": ["/images/…"], "category": "home",
  "sentiments": ["i-miss-you"], "occasions": ["birthday"], "recipients": ["friend"], "allowedExtras": ["premium_wrap"] }
```
List: `{ "data": [product…], "page": 1, "pageSize": 24, "total": 18 }`. `rating` is `null` until there are verified reviews; do **not** invent stars.
Use `effectivePrice` for display and sorting; show `price` struck through when `onOffer`.
`GET /store` gives everything for the announcement bar, the shipping/returns rate table (`deliveryRates` by city, `restOfPakistan`), contact details (may be `null`: hide what is empty) and `paymentMethods` (`cod`, `bank_transfer`, and `card` only when it is really available).
`GET /personalisation/options`: `relationships` (8), `cardDesigns` (4), `messageMaxLength` (900), `starterLines` (8), `extras` `[{code,name,price}]`.

## 4. The gift box, price, and checkout
The gift box lives in the browser. To show totals, send it to **`POST /quote`** every time it changes (debounce a little):
```json
{ "lines": [ { "productId": "…", "quantity": 1,
               "personalisation": { "recipientName": "Maryam", "relationship": "friend", "cardDesign": "classic",
                                    "message": "Thinking of you", "extras": ["premium_wrap"] } } ],
  "delivery": { "city": "Karachi", "method": "address", "date": "2026-11-20" },
  "promoCode": "HELLO10", "email": "customer@example.pk" }
```
Response:
```json
{ "lines": [ { "productId": "…", "name": "…", "quantity": 1, "unitPrice": 999, "extras": [ { "code": "premium_wrap", "name": "Premium wrap", "price": 350 } ],
               "itemsTotal": 999, "extrasTotal": 350, "lineTotal": 1349, "personalised": true } ],
  "itemsTotal": 999, "extrasTotal": 350, "subtotal": 1349, "deliveryFee": 350, "discount": 135, "total": 1564, "currency": "PKR",
  "delivery": { "city": "Karachi", "method": "address", "fee": 350, "freeDelivery": false, "sameDay": true,
                "earliestDate": "2026-11-18", "estimatedBy": "2026-11-18", "requestedDate": "2026-11-20", "perishable": false },
  "promo": { "code": "HELLO10", "applied": true, "percent": 10, "discount": 135 } }
```
Rules you can lean on:
- A personalised gift is its **own line, quantity 1**. Extras belong to that line. Digital gifts have no studio personalisation.
- `delivery.earliestDate` is the first date to offer in the date picker; `sameDay: true` means "order before the cut-off, delivered today". If the customer picks an earlier date, `/quote` answers 400.
- Flowers and chocolate (`isPerishable`, or a chocolate box extra) cannot be scheduled more than 3 days ahead: the 400 says so.
- An unusable promo code is **not** an error: `promo.applied: false` with a `reason` to show next to the code field.
- A digital-only box needs no `delivery` and has `delivery: null`.
- `method: "gift_link"` (see 7) still needs a `city`.
- Count message length in characters, not bytes (an emoji is one).

**`POST /checkout`** takes the same lines plus the person and payment, and prices again:
```json
{ "lines": [ … ], "delivery": { "city": "Karachi", "address": "House 12, Street 4, DHA Phase 5", "phone": "03001234567", "date": "2026-11-20" },
  "contact": { "email": "customer@example.pk", "name": "Ayesha Khan" }, "promoCode": "HELLO10",
  "paymentMethod": "cod | bank_transfer | card" }
```
Add digital lines as `{ "productId": "…", "quantity": 1, "digital": { "recipientEmail": "…", "message": "…", "sendAt": "2026-12-01T09:00:00Z" } }` (`sendAt` optional).
Send an **`Idempotency-Key`** header (a new random value per checkout attempt, reused if the customer double-clicks or you retry): the same key returns the first order instead of a second.
Guests can check out (give `contact.email`); a signed-in customer's token ties the order to their account.
Response `201`:
```json
{ "order": { "id": "…", "number": "SN-7K3M9Q2X", "status": "placed", "statusLabel": "Order received", "paymentMethod": "cod",
             "subtotal": 800, "deliveryFee": 350, "discount": 0, "total": 1150, "city": "Karachi", "deliveryDate": "2026-11-18", "sameDay": true,
             "lines": [ … ], "timeline": [ { "status": "placed", "label": "Order received", "at": "…" } ] },
  "payment": { "method": "cod", "instructions": "(bank transfer only)", "redirectUrl": "(card only)" },
  "giftLink": { "url": "(gift link only)" }, "replayed": false }
```
| Method | Allowed for | After checkout |
|---|---|---|
| `cod` | physical gifts with a known address | status `placed` |
| `bank_transfer` | everything | status `awaiting_payment`; show `payment.instructions` and the order number to quote; staff confirm |
| `card` | only if `/store` lists it | status `awaiting_payment`; send the customer to `payment.redirectUrl` |

Typical 400/409 on checkout: missing address/phone, COD with a digital gift or gift link, a gift that sold out between quote and pay (`409`: tell the customer which one and let them edit the box).

## 5. Order statuses (use these labels)
| `status` | Customer label | Meaning |
|---|---|---|
| `awaiting_payment` | Waiting for payment | bank transfer / card not confirmed yet |
| `placed` | Order received | cash on delivery accepted |
| `paid` | Payment received | |
| `preparing` | Being prepared | cancelling online stops being possible |
| `in_production` | Being made for you | a personalised item is being made; cannot be cancelled |
| `dispatched` | On its way | `delivery.courier` / `trackingRef` may be set |
| `failed_delivery` | Delivery attempt failed | |
| `delivered` | Delivered | returns/damage reports open |
| `returned`, `refunded`, `cancelled` | as named | |

`statusLabel` and `timeline: [{status,label,at}]` come ready-made on every order. Digital-only orders go `awaiting_payment → paid → delivered` by themselves.

## 6. After the purchase (no sign-in needed: order number + email)
| Screen | Call |
|---|---|
| Track | `POST /orders/track {number,email}` → `{number,status,statusLabel,placedAt,deliveryDate,estimatedBy,timeline}`. Never shows address or contact. A wrong email and an unknown number give the same 404 |
| Cancel | `POST /orders/cancel {number,email,reason?}` → `{number,status,refund:{amount,dueBy,note}|null}`. 409 messages explain why not (preparing / in production) |
| Return or damage | `POST /orders/returns {number,email,kind:"return"\|"damaged",reason,photoUrls?,lines?,confirmUnused?}` → `{id,status,refundAmount}`. Damage: within 48 hours, at least one photo **link**. Return: within 7 days, `confirmUnused: true`, not for personalised/digital gifts |
| Gift card check | `POST /gift-cards/check {code}` → `{valid, kind?, amount?, expiresAt?}` or `{valid:false, reason:"expired"\|"not_found"}` |
| Contact / bulk gifting | `POST /contact {name,email,phone?,orderNumber?,topic,subject,message}`; topics: `order, delivery, payment, personalisation, bulk_gifting, other` |

Photo upload is **not available** yet (no file storage): damage reports take web links, and the studio has no photo upload on personalisation.

## 7. Gift links (the recipient's pages)
The sender gets `giftLink.url` (`…/gift/<token>`) from checkout and by email. Build a page at that URL:
- `GET /gift-links/:token` → `{status:"ready"|"claimed"|"expired", recipientName, city}`. 404 = invalid or cancelled. Shows nothing about the sender: keep it that way.
- `POST /gift-links/:token/claim {address, phone, name?}` → `200`; `409` already claimed; `410` expired.
The recipient never gives a city: it stays the one the sender chose.

## 8. Accounts (signed in)
`POST /auth/register {email,password(min 8),name?}`, `/auth/login`, `/auth/google {idToken}` → `{accessToken, customer:{id,email,name,phone,role,authProvider,emailVerified}}`.
**Confirming the email.** Registering sends a link (`<APP_URL>/verify-email?token=…`). Build that page to call `POST /auth/verify-email {token}`. Until then `emailVerified` is `false`: show a banner with a "send it again" button (`POST /auth/resend-verification`, signed in). The person can shop and sign in meanwhile; an address that is never confirmed can later be taken over by its real owner, so do not treat an unconfirmed account as proof of identity.
**Password reset.** `POST /auth/forgot-password {email}` always answers 202 (it does not reveal accounts); the email link carries a token for `POST /auth/reset-password {token,password}`. The page is `<APP_URL>/reset-password?token=…`.
**Old guest orders.** An order placed without signing in is *not* attached to an account that later uses the same email (anyone can type an email). To add one, a signed-in customer enters the order number and the email it was placed with: `POST /me/claim-order {number,email}` → `{number, added}` (404 when the pair is wrong or the order belongs to someone else). Offer this on the tracking page ("Add this order to my account") and in the order list. A shopper who signs in at checkout gets the order in their account straight away.
`GET/PATCH /me` · `GET /me/wishlist`, `PUT|DELETE /me/wishlist/:productId` · `GET/POST /me/reminders`, `PATCH|DELETE /me/reminders/:id` (`{label,date,recipientName?,notifyDaysBefore 0-60}`; repeats yearly) · `GET /orders`, `GET /orders/:number` · `GET /me/export` (download my data) · `DELETE /me {password}` (delete my account; 409 while an order is in progress) · `GET|POST /products/:slug/reviews` (anyone signed in may review; only buyers' reviews count towards the rating, and each has `verified`).
Escape every piece of customer text (names, messages, reviews) when you render it: the API stores it as plain text.

## 9. Admin console (staff / admin)
| Screen | Calls |
|---|---|
| Order queue | `GET /admin/orders?status=a,b&city=&q=&from=&to=&page=&pageSize=`; `GET /admin/orders/:id` (full order, payments, gifts, gift-link state) |
| Move an order | `POST /admin/orders/:id/status {status, note?, courier?, trackingRef?}`; 409 explains an illegal move. "Confirm bank transfer" = move to `paid` |
| Production board | `GET /admin/production` → `{preparing:[…], inProduction:[…]}` with each message and card design |
| Dispatch rota | `GET /admin/dispatch?date=2026-11-18&city=` → by city: recipient, address, phone, courier, cash to collect, `waitingForRecipientAddress` |
| Catalogue | `GET/POST /admin/products`, `PATCH/DELETE /admin/products/:id` (delete hides), `POST/PATCH /admin/taxonomy`. Images are **URLs** for now |
| Reviews | `GET /admin/reviews`, `PATCH /admin/reviews/:id {status:"published"\|"hidden"}` |
| Inbox | `GET /admin/contact`, `PATCH /admin/contact/:id {status}` |
| Returns & refunds | `GET /admin/returns`, `POST /admin/returns/:id/decision`, `.../complete`; `GET /admin/refunds?status=pending` (flags `overdue`), `POST /admin/refunds/:id/process` |
| Reports | `GET /admin/reports/summary?from=&to=` |
| Settings (admin to change, staff to view) | `GET/PATCH /admin/store` (send the **whole** delivery table), `GET/POST/PATCH /admin/promo-codes`, `GET/PATCH /admin/extras` |
| Team (admin) | `GET/POST /admin/staff`, `DELETE /admin/staff/:id` |
| Support | `POST /admin/digital-gifts/:id/retry`, `POST /admin/privacy/erase {email}` (admin), `POST /admin/scheduler/run` (admin) |

## 10. Dos and don'ts
- Re-run `/quote` whenever the box, city, date or code changes; show `total` from the response only.
- Keep the token in memory or `sessionStorage`; never in a URL. Remember private data is `Cache-Control: no-store` for a reason: do not cache it in a service worker.
- Offer only dates from `delivery.earliestDate`; show the 1pm cut-off from `/store.sameDayCutoffHour`.
- Treat every `409` as a normal outcome with a message to show.
- The catalogue is cached for 60 seconds at the edge, so a price edit can take up to a minute to show.
- Use `/api/v1/openapi.json` to generate a typed client for request bodies.
