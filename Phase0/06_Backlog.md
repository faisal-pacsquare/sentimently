# Backlog (epics and stories)

Priority: M = must for launch, S = should, C = could (cut first). Phase = backend phase where the API work lands. Frontend work for each epic starts only after the Backend Gate. Acceptance criteria will be written per story in Week 2–3 with the product owner.

| Epic | ID | Story | Pri | Phase |
|---|---|---|---|---|
| E1 Platform | E1-1 | As a developer, I get a running API with health check, logs and error model | M | B1 |
| | E1-2 | As an operator, I get rate limiting and caching so page loads don't trigger 429 | M | B1 |
| E2 Catalogue | E2-1 | Filter gifts by feeling, occasion, recipient, category, type, budget | M | B1 |
| | E2-2 | Keyword search and sort (popularity, price, rating, newest) | M | B1 |
| | E2-3 | Product detail with lead time, stock, allowed extras | M | B1 |
| | E2-4 | Browse hubs for 14 feelings, 8 occasions, 6 recipients, 11 categories | M | B1 |
| | E2-5 | Staff create, edit, deactivate products and upload images | M | B1 |
| E3 Accounts | E3-1 | Register, log in, reset password | M | B2 |
| | E3-2 | Sign in with Google | M | B2 |
| | E3-3 | Wishlist | S | B2 |
| | E3-4 | Save occasion reminders | S | B2 |
| | E3-5 | Verified reviews and moderation | S | B2 |
| | E3-6 | Staff and admin roles | M | B2 |
| E4 Basket and personalisation | E4-1 | Add to gift box with quantities | M | B3 |
| | E4-2 | Personalise: name, relationship, 900-char message, card, packaging, extras | M | B3 |
| | E4-3 | Upload photos for personalised items | S | B3 |
| | E4-4 | Server-side pricing: extras, delivery fee, promo, totals | M | B3 |
| | E4-5 | Delivery-date validation (1pm cut-off, 3-day perishables) | M | B3 |
| E5 Orders and payments | E5-1 | Place an order (guest rule per Q1) | M | B4 |
| | E5-2 | Pay by cash on delivery | M | B4 |
| | E5-3 | Pay by bank transfer, staff confirm | M | B4 |
| | E5-4 | Pay by card through the gateway | S | B4 |
| | E5-5 | Track an order by number and email | M | B4 |
| | E5-6 | Order emails (confirmation, status) | M | B4 |
| | E5-7 | Staff order and production queue | M | B4 |
| E6 Digital gifts | E6-1 | Buy and send an e-gift card (Rs 5,000, 12 months) | M | B4 |
| | E6-2 | Buy and send an animated greeting card (Rs 500) | M | B4 |
| | E6-3 | Schedule a digital gift to the minute | M | B5 |
| E7 Fulfilment | E7-1 | Single-use gift links | M | B5 |
| | E7-2 | Courier booking and tracking, or dispatch rota | M | B5 |
| | E7-3 | Cancellation rules | M | B5 |
| | E7-4 | Returns, damage claims, refunds | M | B5 |
| | E7-5 | Failed-delivery handling | S | B5 |
| | E7-6 | SMS / WhatsApp notices | S | B5 |
| E8 Engagement | E8-1 | Occasion reminders sent on time | C | B5 |
| | E8-2 | Bulk-gifting enquiry | C | B5 |
| | E8-3 | Contact form (6 topics) | S | B2 |
| | E8-4 | Reports (sales, orders, delivery, promos) | C | B5 |
| E9 Quality | E9-1 | Automated test for every business rule | M | B1–B5 |
| | E9-2 | Load and security tests | M | B6 |
| | E9-3 | OpenAPI v1 frozen, Postman collection | M | B6 |
| E10 Data and content | E10-1 | Import existing 18 gifts and taxonomy | M | B1 |
| | E10-2 | Replace placeholder contact data and sample reviews | M | before launch |

## Notes
- "Cut first" order if the backend runs late: E8-1, E8-2, E8-4, then E7-6, E7-5.
- Frontend stories are derived from these at the Backend Gate.
