# Acceptance Criteria (must-have stories)

Format: Given / When / Then. Story IDs match 06_Backlog.md. Rule IDs match 02_Business_Rules.md.

## E1 Platform
- **E1-1** Given the API is running, when `GET /api/v1/health` is called, then it returns 200 with the data-store status. Every error response has the shape `{ error: { code, message, requestId } }`.
- **E1-2** Given a client exceeds the request limit, when it calls again, then it receives 429 with `Retry-After`, and never a 404. Given identical catalogue queries within the cache window, then only one reads the data store.

## E2 Catalogue
- **E2-1** Given 18 seeded gifts, when filtering by any combination of feeling, occasion, recipient, category, type and budget, then results match exactly, are paginated, and an empty match returns 200 with an empty list.
- **E2-2** Given a keyword, when searching, then name and description matches return. Each sort option orders results correctly.
- **E2-3** Given a product slug, then the response includes price, offer price, lead time, stock and allowed extras. An unknown slug returns 404; a data-store failure returns 5xx.
- **E2-4** Given a hub slug (feeling, occasion, recipient, category), then the same filtered grid is returned.
- **E2-5** Given a staff user, when creating or editing a product and uploading an image, then the change is visible in the catalogue. A customer gets 403.

## E3 Accounts
- **E3-1** Register with email and password, log in, and reset password by emailed link. Duplicate email is rejected. Passwords are stored hashed.
- **E3-2** A Google sign-in creates or links an account by email.
- **E3-6** Customer, staff and admin roles are enforced on every route.

## E4 Basket and personalisation
- **E4-1** Add, change quantity and remove items in the gift box.
- **E4-2** Name is required (PZ-01). Message over 900 characters is rejected (PZ-03). Invalid relationship or card design is rejected.
- **E4-4** Given a gift box, then the server returns items, extras, delivery fee, discount and total. A price sent by a client is ignored (PR-07). HELLO10 follows PR-04 and PR-05. Delivery follows DL-01 to DL-07.
- **E4-5** Same-day is offered before 1pm in eligible cities only (DL-01, DL-02). Perishables cannot be scheduled beyond 3 days (SC-01).

## E5 Orders and payments
- **E5-1** An order is created in one transaction with a stock decrement. Two simultaneous orders for the last item: one succeeds, one fails with a clear message (PY-03).
- **E5-2** COD is accepted for a physical order with an address (Q15).
- **E5-3** Bank-transfer orders stay "awaiting payment" until staff confirm.
- **E5-4** A card payment completes through the gateway adapter. A repeated webhook does not duplicate the payment (PY-02). The feature flag hides card when off.
- **E5-5** Tracking by order number and email returns status and dates only (OR-07). A wrong pair returns the same response as an unknown order.
- **E5-6** Confirmation and status emails are queued and logged.
- **E5-7** Staff see a filterable order queue and move orders through the allowed transitions only.

## E6 Digital gifts
- **E6-1 / E6-2** Purchasing creates a unique code and sends an email within a minute. E-gift cards expire after 12 months (SC-03).
- **E6-3** A gift scheduled for a chosen minute sends within 60 seconds of that time (SC-02), and is still sent after an app restart (state is read from the data store, not memory). Sent by the cron-called scheduler endpoint, which rejects calls without the cron secret.

## E7 Fulfilment
- **E7-1** A gift link can be claimed once (GL-01), shows no sender details (GL-02), and expires after 30 days (GL-04).
- **E7-2** Staff update delivery status and tracking. The courier adapter interface exists.
- **E7-3** Cancellation works before production and is refused after it (OR-01, OR-02).
- **E7-4** Returns, damage claims and refunds follow OR-03 to OR-05. A refund task has a due date.

## E9 / E10 Quality and data
- **E9-1** Every rule ID in 02_Business_Rules.md has at least one named automated test. CI fails if a rule has none.
- **E10-1** The import is re-runnable and creates the 18 gifts and the full taxonomy without duplicates.
