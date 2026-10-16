# Sentimently: Backend-First Phase & Milestone Plan

Source: *Sentimently — Application Analysis & Project Plan* (14 Oct 2026). Kickoff Monday 2 Nov 2026 (Week 1).
Stack: Node.js + NestJS (TypeScript), JSON-file data store (no database), Vercel hosting with Vercel Cron, Passport.js; React storefront and React admin console.

## 1. The working rule

**Backend is built and signed off completely first. Frontend work starts only after the Backend Gate (M-B6).**

- The Backend Gate means: every API module is finished, every business rule has an automated test, and the OpenAPI contract is frozen as v1.
- UI/UX design runs in parallel from Week 1. It produces designs, not code.
- Frontend developers do not write product UI before the gate.

### Impact on the original dates (needs a decision)

The source plan overlaps backend and frontend, with Release 1 on 5 Feb 2027 and full launch on 2 Apr 2027. Strict sequencing cannot hit those dates. The source plan sizes frontend at about 38 person-weeks. Two frontend developers cannot do that in the 8 weeks that remain after a backend that ends in Week 13.

| Item | Source plan | Backend-first plan |
|---|---|---|
| Backend complete | Rolling, to Week 18 | **End of Week 14 (5 Feb 2027)** |
| Frontend start | Week 4 | **Week 15 (8 Feb 2027)** |
| Release 1 (5 Feb, before Ramadan) | Yes | **Not possible** |
| Eid al-Fitr gifting (about 10 Mar) | Covered | **Missed** |
| Full launch | 2 Apr 2027 (Week 22) | **30 Apr 2027 (Week 26)** |

Ways to protect the Eid window are listed in section 7.

## 2. Timeline at a glance

| Phase | Weeks | Dates | Output |
|---|---|---|---|
| 0. Foundation | 1–3 | 2–20 Nov 2026 | Scope, designs, architecture, vendors |
| B1. Platform & catalogue | 4–5 | 23 Nov–4 Dec | Running API, catalogue, admin catalogue API |
| B2. Identity & engagement | 6–7 | 7–18 Dec | Auth, wishlist, reviews, reminders data |
| B3. Pricing & personalisation | 8–9 | 21 Dec–1 Jan | Gift box, studio rules, delivery fees, promos |
| B4. Orders & payments | 10–11 | 4–15 Jan | Orders, 3 payment methods, tracking, email, digital gifts |
| B5. Fulfilment & gifting | 12–13 | 18–29 Jan | Gift links, scheduler, couriers, returns, reporting |
| B6. Backend hardening and gate | 14 | 1–5 Feb | Load/security tests, API freeze v1 |
| F1. Frontend foundation & browse | 15–16 | 8–19 Feb | Design system in code, home, browse, search |
| F2. Product, accounts, engagement | 17–18 | 22 Feb–5 Mar | Product page, sign-in, wishlist, reviews |
| F3. Personalisation & gift box | 19–20 | 8–19 Mar | Studio with live preview, gift box |
| F4. Checkout & post-purchase | 21–22 | 22 Mar–2 Apr | Checkout, payments, tracking, digital gifts, gift-link claim |
| F5. Admin console | 15–22 (parallel) | 8 Feb–2 Apr | Catalogue, order queue, production, reports |
| F6. Integration & polish | 23–24 | 5–16 Apr | End-to-end flows, performance, accessibility |
| 7. UAT and launch | 25–26 | 19–30 Apr | Acceptance sign-off, **launch 30 Apr 2027** |

---

## 3. Phase 0: Foundation (Weeks 1–3, 2–20 Nov 2026)

**Goal:** remove every unknown that could stall the backend.

| # | Task | Owner |
|---|---|---|
| 0.1 | Review the login-protected pages (accounts, orders, wishlist, reminders, checkout) with a test account | BA |
| 0.2 | Close the open questions: guest checkout, Urdu, express dispatch on made-to-order items, Base44 export, Sargodha fee and timing | BA + product owner |
| 0.3 | Start the payment gateway merchant application. This has the longest lead time. | Tech lead |
| 0.4 | Choose the courier model (APIs or dispatch rota) and confirm Sargodha coverage | Tech lead + studio |
| 0.5 | Finalise the data model for about 18 entities (ERD) and the production-state definitions | Tech lead + BA |
| 0.6 | Repo, branching, CI/CD, dev/staging environments, Vercel project, JSON data store, secrets handling | Tech lead + DevOps |
| 0.7 | API conventions: REST + OpenAPI, versioning, pagination, and an error model that **separates errors from empty results** (prototype finding 1) | Tech lead |
| 0.8 | Design system and wireframes for storefront and admin (designer, continues through Week 14) | Designer |
| 0.9 | Export Base44 catalogue content and images, or plan manual re-entry | BA |

**Milestone M0 (Week 3):** scope, ERD, architecture, designs started, gateway application submitted, courier approach decided. Studio product owner signs off.

---

## 4. Backend phases (Weeks 4–14)

Team: 2 backend developers + technical lead (QA from Week 4, DevOps part-time).
Every module ships with: unit tests, integration tests, OpenAPI docs, a Postman collection, and seed data.

### B1: Platform & catalogue (Weeks 4–5)

- **Tasks**
  - NestJS app skeleton with config, logging, health checks, and global error handling.
  - JSON collections and seed data for Product, Sentiment, Occasion, Recipient group, Category, StoreConfig.
  - Catalogue module:
    - list products with server-side filtering by feeling (14), occasion (8), recipient (6), category (11), type (physical/digital) and budget;
    - keyword search, sort by popularity, price, rating and newest, and pagination;
    - single-product endpoint with lead time, stock, and which extras apply.
  - Browse hub endpoints for sentiments, occasions, recipient groups and categories.
  - In-memory catalogue cache and per-instance rate limiting. This fixes the prototype's duplicate requests and 429-as-"not found" bug.
  - Admin catalogue API (CRUD, offer price, active flag, stock) and image upload to S3 with CDN.
  - Import script for the 18 existing gifts and the taxonomy.
- **Milestone M-B1 (end Week 5):** any gift is queryable by every filter combination. Staging is deployed and the catalogue is seeded.
- **Exit test:** a filter query returns the correct set in under 300 ms (cached). A forced error returns a distinct error status, never an empty list.

### B2: Identity & engagement (Weeks 6–7)

- **Tasks**
  - Customer entity, email/password register and login, Google sign-in (Passport.js), forgot/reset password, JWT or session handling, and roles (customer, studio staff, admin).
  - Profile endpoints.
  - Wishlist module.
  - Saved occasion reminders (data and CRUD; sending comes in B5).
  - Reviews module: only a signed-in customer can post, ratings come only from verified reviews, and an admin moderation endpoint. This removes the "sample rating" problem.
  - Contact message and bulk-gifting enquiry endpoints.
  - Guest-checkout identity model, following the decision from task 0.2.
- **Milestone M-B2 (end Week 7):** a full account lifecycle works through the API.
- **Exit test:** role-based access tests pass, and review and rating counts match the stored reviews.

### B3: Pricing, gift box & personalisation (Weeks 8–9)

- **Tasks**
  - Gift box (cart) module with line items and quantities.
  - Personalisation model: recipient name (required), relationship (8 options), message up to 900 characters, card design (4), packaging, 5 paid extras, and photo upload with validation and storage.
  - **Pricing engine** (server-side, the single source of truth):
    - item total plus extras: premium wrap +350, keepsake box +750, chocolate box +1,200, dried flower posy +900, express same-day +600;
    - delivery fee by city (350 / 400 / 550 / 650 / 0 digital; Sargodha configurable), free over Rs 5,000;
    - promo codes (HELLO10: 10%, first order, minimum Rs 3,000) with first-order flag and minimum-order rules.
  - Per-product extras rules, so the engine rejects "express same-day" on made-to-order items if the business decides so.
  - Delivery-date validation: the 1pm same-day cut-off and the 3-day perishable limit.
  - Message "help me write it" starter lines, as a content endpoint.
- **Milestone M-B3 (end Week 9):** a priced quote for any gift box is correct against the business-rules table.
- **Exit test:** rule tests for pricing, promos, fees, cut-off and the perishable limit all pass.

### B4: Orders, payments & notifications (Weeks 10–11)

- **Tasks**
  - Order and order-line entities, order state machine (placed, paid, in preparation, in production, dispatched, delivered, cancelled, refunded) and stock decrement in a transaction.
  - Checkout API: address capture, delivery date, or "send as gift link".
  - Payments:
    - cash on delivery;
    - bank transfer with a reconciliation or manual confirmation flow;
    - card gateway integration (hosted page, webhook, idempotency) and refund calls.
    - If the gateway is late, ship with COD and bank transfer only. The card module stays behind a feature flag.
  - Order tracking by order number + email, returning status only and never address or contact details.
  - Transactional email (confirmation, status updates) using templates.
  - **Instant digital gifts:** e-gift card (Rs 5,000, valid 12 months) and animated greeting card (Rs 500), with unique codes and email delivery.
  - Admin order queue API: list, filter, status change, and production queue.
- **Milestone M-B4 (end Week 11):** an order completes end to end on staging by API with every payment method.
- **Exit test:** a payment failure or duplicate webhook never creates a double charge or double order, and tracking never leaks personal details.

### B5: Fulfilment & gifting (Weeks 12–13)

- **Tasks**
  - **Gift links:** single-use token, claimable once, recipient adds address and phone, and the sender never sees them.
  - **Scheduler (Vercel Cron calling a protected endpoint):** timed digital gifts to the minute, scheduled physical delivery, and occasion reminder sending. Includes retry, dead-letter handling and alerts.
  - Courier integration or dispatch rota for Karachi, Lahore, Islamabad and Sargodha, with a configurable daily same-day capacity.
  - Cancellation rules: free until preparation starts, blocked once a personalised item is in production.
  - Returns and refunds workflow: 7 days for non-personalised items, 48-hour damage report with photo, refund within 3 working days, and the failed-delivery rule (contact after two attempts, one free re-delivery in the same city).
  - SMS/WhatsApp notices for recipients and delivery calls.
  - Bulk-gifting enquiry handling and reporting endpoints (sales, orders by status, delivery performance, promo use).
  - Per-project change log, to hold scope against growth.
- **Milestone M-B5 (end Week 13):** every rule in the business-rules table has an automated test, and the scheduler delivers on time on staging.
- **Exit test:** a digital gift scheduled for a chosen minute sends within that minute. A second claim of a gift link is refused.

### B6: Backend hardening and Backend Gate (Week 14, 1–5 Feb 2027)

- **Tasks**
  - Load test (catalogue, checkout, rate limits) and fix.
  - Security review: OWASP checks, authorisation tests, secrets, dependency scan, and personal-data handling (photos, messages: retention and deletion).
  - Error monitoring, structured logs, uptime checks and alert rules (failed payments, missed deliveries page someone).
  - Full OpenAPI v1 published, Postman collection and environment, and a short integration guide for frontend.
  - Production-like seed data and a content import rehearsal.
  - Regression pack in CI. Support runbook (draft).
- **Milestone M-B6, the Backend Gate (5 Feb 2027):** go/no-go review.
  - Every module done and every rule test green.
  - API contract frozen at v1. Changes after this point go through the change log.
  - Staging deployed from CI.
  - **Only after this sign-off does frontend implementation begin.**

---

## 5. Frontend phases (Weeks 15–26)

Team: 2 frontend developers + designer (final polish) + QA. Two backend developers move over to help on the frontend after the gate. This assumes they are comfortable in React, which needs confirming because the source plan hired them as Node.js engineers. One backend developer keeps about 30% of their time for API fixes and worker support.
Two streams run in parallel: storefront and admin console.

### F1: Foundation & browse (Weeks 15–16)

- **Tasks**
  - React project setup, routing, and typed API client generated from the OpenAPI v1.
  - Design system in code: tokens, components, Storybook, responsive grid.
  - Prerendered browse and product pages for SEO.
  - Home page: hero, announcement bar, feeling grid, occasion grid, 8 popular gifts, explainers.
  - Navigation (Shop All, By Sentiment, By Occasion, By Recipient, Categories, Digital Gifts), footer.
  - Shop All with filters, search, sort and pagination. Browse hub pages.
  - Real loading, empty and **error states** (prototype finding 1).
- **Milestone M-F1 (end Week 16):** a shopper can find any gift by feeling, occasion, recipient, category and budget.

### F2: Product, accounts & engagement (Weeks 17–18)

- **Tasks**
  - Product page: gallery, price, lead time, stock, payment methods, returns and sizing panels, verified reviews.
  - Register, login, Google sign-in, reset password, and profile.
  - Wishlist, saved occasions and reminders, and order history.
  - Support pages: FAQ, shipping rate table, contact form, bulk-gifting enquiry, About, privacy, terms.
- **Milestone M-F2 (end Week 18):** full account journey works in the browser, and reviews can be posted by signed-in customers.

### F3: Personalisation studio & gift box (Weeks 19–20)

- **Tasks**
  - Personalisation studio: recipient name, relationship, message (900-character counter, starter lines, "Help me write it"), card design picker, packaging and paid extras.
  - Photo upload with preview, progress and validation errors.
  - **Live preview** and running total from the server pricing engine.
  - Gift box page: edit, remove, and totals with delivery fee and promo code.
  - Message read-back on screen before payment.
- **Milestone M-F3 (end Week 20):** a personalised gift can be built, previewed, priced and held in the gift box.

### F4: Checkout & post-purchase (Weeks 21–22)

- **Tasks**
  - Checkout: address entry or "send as gift link", delivery date picker (cut-off and perishable limits shown), promo code, and payment selection (COD, bank transfer, card).
  - Card payment flow with the gateway's hosted page, failure and retry handling.
  - Order confirmation, order tracking page (order number + email), and transactional email links.
  - Digital gift purchase flow with schedule picker.
  - Recipient gift-link claim page (single use, address and phone entry, never showing sender details).
- **Milestone M-F4 (end Week 22):** an order completes end to end in the browser on staging with every payment method.

### F5: Admin console (Weeks 15–22, parallel stream)

- **Tasks**
  - Staff login and roles.
  - Catalogue management: products, taxonomy, images, stock, offers.
  - Order queue and production queue (read the message, write it by hand, engrave or print, wrap, photograph, dispatch), with production-state controls and the cancellation cut-off.
  - Courier and dispatch screens, same-day capacity setting, and StoreConfig (banner, promo codes, delivery rates including Sargodha).
  - Review moderation, contact and bulk-gifting inbox, refunds and returns handling, and reports.
- **Milestone M-F5 (end Week 22):** studio staff can run a full order from received to dispatched without developer help.

### F6: Integration & polish (Weeks 23–24, 5–16 Apr 2027)

- **Tasks**
  - Full regression of every journey across mobile and desktop browsers.
  - Performance pass (Core Web Vitals, image sizes, prerender coverage).
  - Accessibility pass (keyboard, contrast, labels).
  - Real content loaded: photography, copy, real phone number and social links (prototype finding 6).
  - Bug fixing. Any API defect found goes back through the change log to the backend developer on call.
- **Milestone M-F6 (end Week 24):** feature complete, no open critical or high bugs.

### Phase 7: UAT & launch (Weeks 25–26, 19–30 Apr 2027)

- **Tasks**
  - User acceptance testing with studio staff using real orders on staging.
  - Training, final runbooks, and production cut-over rehearsal.
  - Smoke test on production, then launch.
  - Two weeks of hypercare after launch.
- **Milestone M-L (30 Apr 2027):** acceptance sign-off, then full launch.

---

## 6. Gates and ownership summary

| Gate | Week | Passes when |
|---|---|---|
| M0 Foundation | 3 | Scope, ERD, architecture, designs, vendors signed off |
| M-B1 to M-B5 | 5, 7, 9, 11, 13 | Module exit tests green on staging |
| **M-B6 Backend Gate** | **14** | **All backend done, API v1 frozen. Frontend starts.** |
| M-F1 to M-F5 | 16, 18, 20, 22, 22 | Journey works in browser on staging |
| M-F6 | 24 | Feature complete, no critical or high bugs |
| M-L Launch | 26 | UAT sign-off |

## 7. Risks from going backend-first, and decisions needed

| Risk / decision | Effect | Suggested handling |
|---|---|---|
| Eid and Ramadan season is missed | Revenue window lost (Eid about 10 Mar 2027) | Decide now. Option A: accept the 30 Apr launch. Option B: shift to the source plan's overlapped build with a thin storefront for 5 Feb. Option C: add 2 more React developers so frontend finishes by about Week 21. |
| Late discovery of API gaps | Frontend finds missing fields after the freeze | A written API review with the designer at M-B5, using the wireframes. Changes go through the change log. |
| Frontend developers idle for 11 weeks | Wasted cost | Move them to start later, or loan them to backend test automation and content import scripts. Confirm which. |
| Backend is compressed to 11 weeks | The source plan allows about 40 person-weeks over 20 weeks. This plan has about 33. | Treat reminders, bulk gifting and reporting as the first scope to cut (they sit in B5 and can slip to post-launch). |
| Payment gateway approval is slow | Card payments late | Start in Week 1. Launch with COD and bank transfer if needed. |
| Thin catalogue (18 gifts, five categories with 1 gift each) | Weak launch | Studio supplies products, copy and photography by Week 14, since there is no frontend to wait for. |
| Sargodha fee and timing unknown | Delivery rule incomplete | Settle in Phase 0. Make it a StoreConfig value. |
| Effort estimate is plus or minus 25% | Dates may move | Re-baseline at M0. |

## 8. Items the studio must provide

- A product owner who can decide within two working days.
- Product copy and photography by Week 14.
- Studio staff for UAT in Weeks 25–26.
- A test account for the login-protected pages in Week 1.
