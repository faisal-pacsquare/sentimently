# Business Rules Specification

Every rule has an ID and becomes at least one automated test (Phase 3 exit gate). Source: the analysis PDF, p. 5–6. Rules marked **[PROPOSED]** are not in the PDF and need product-owner confirmation.

Status after B5: every rule is implemented and tested except PZ-04 (message read-back, a frontend rule) and PZ-06 (private photo storage, needs an object store). Earlier: DL-01 to DL-10, PR-01 to PR-08, PZ-01 to PZ-03, PZ-05 and SC-01 came with B3. Interpretations are listed in Backend_Progress.md.

## Delivery

| ID | Rule | Test idea |
|---|---|---|
| DL-01 | Karachi and Lahore: fee Rs 350, same day if ordered before 1pm | Order at 12:59 gets same-day, 13:00 gets next-day |
| DL-02 | Islamabad and Rawalpindi: fee Rs 400, same day if ordered before 1pm | As above |
| DL-03 | Faisalabad, Multan, Peshawar, Sialkot, Gujranwala, Hyderabad, Quetta: Rs 550, 1–2 working days | Fee and estimate by city |
| DL-04 | Rest of Pakistan: Rs 650, 2–4 working days | Fee by unlisted city |
| DL-05 | Sargodha: fee and timing TO BE SET (Q7). Stored as a configurable rate | Rate editable without deploy |
| DL-06 | Digital gifts: fee Rs 0, instant or scheduled to the minute | Fee zero for digital-only box |
| DL-07 | Delivery is free on orders over Rs 5,000 | Rs 5,000 exactly: **[PROPOSED]** fee still applies ("over" is read strictly). Rs 5,001: free |
| DL-08 | Made-to-order items show a lead time and the delivery estimate starts after it | Necklace 5–7 working days |
| DL-09 | Same-day requires daily capacity to be available (setting per city) | Capacity 0 disables same-day |
| DL-10 | Delivery is within Pakistan only | Foreign address rejected |

## Pricing, extras and promos

| ID | Rule | Test idea |
|---|---|---|
| PR-01 | Classic wrap is included | Extra of Rs 0 |
| PR-02 | Paid extras: premium wrap +350, keepsake box +750, chocolate box +1,200, dried flower posy +900, express same-day dispatch +600 | Total = item + extras |
| PR-03 | Each product has a list of allowed extras. Express same-day is not allowed on made-to-order items **[PROPOSED, Q5]** | Disallowed extra rejected |
| PR-04 | Promo HELLO10: 10% off a first gift, on orders over Rs 3,000 | Rs 3,000 exactly **[PROPOSED]** rejected, Rs 3,001 accepted |
| PR-05 | A first-gift code works once per customer (first-order flag) | Second order rejected |
| PR-06 | A product's offer price replaces its list price while active | Offer price used in totals |
| PR-07 | The server computes every total. The client never sends a price | Tampered price ignored |
| PR-08 | Open: does the promo apply to the item subtotal only or include extras and delivery? **[PROPOSED]** item subtotal plus extras, not delivery | Confirm Q-new |

## Personalisation

| ID | Rule | Test idea |
|---|---|---|
| PZ-01 | Recipient name is required before adding to the gift box | Missing name rejected |
| PZ-02 | Relationship is one of 8 options | Invalid value rejected |
| PZ-03 | Message is at most 900 characters | 900 accepted, 901 rejected |
| PZ-04 | Message is read back on screen before payment (frontend), and stored exactly as confirmed | Stored text equals confirmed text |
| PZ-05 | Card design is one of 4 options | Invalid rejected |
| PZ-06 | Customer photos are stored privately and linked only to the order | Photo URL not guessable |

## Scheduling and perishables

| ID | Rule | Test idea |
|---|---|---|
| SC-01 | Flowers and chocolate cannot be scheduled more than 3 days ahead | Day 3 accepted, day 4 rejected |
| SC-02 | Digital gifts send at the chosen date and minute | Sent within 60 seconds of the target |
| SC-03 | E-gift card is valid 12 months from issue | Expired code rejected |
| SC-04 | A failed scheduled job retries and alerts | Retry then alert after limit |

## Gift links

| ID | Rule | Test idea |
|---|---|---|
| GL-01 | A gift link can be claimed once | Second claim refused |
| GL-02 | The link never reveals sender details | Response has no sender fields |
| GL-03 | The recipient's address and phone are visible to staff and courier, never to the sender | Sender API never returns them |
| GL-04 | Link expiry **[PROPOSED]** 30 days (Q14) | Expired link refused |

## Orders, cancellation, returns

| ID | Rule | Test idea |
|---|---|---|
| OR-01 | Cancellation is free until preparation starts | Allowed in "placed", "paid" |
| OR-02 | Cancellation is not possible once a personalised item is in production | Refused in "in production" |
| OR-03 | Damaged on arrival: customer sends a photo within 48 hours. Replacement or full refund including delivery | Day 2 accepted, later refused |
| OR-04 | Returns: non-personalised items within 7 days, unused, original packaging. Return cost is the customer's unless faulty | Personalised item return refused |
| OR-05 | Approved refunds are processed within 3 working days. Bank transfers land in 5–7 working days | Refund task due date set |
| OR-06 | Failed delivery: studio contacts the sender after two attempts. First re-delivery in the same city is free | Re-delivery fee 0 once |
| OR-07 | Order tracking by order number plus email returns status only, never address or contact details | Response has no PII |
| OR-08 | Reviews can only be written by signed-in customers. **[PROPOSED]** Only buyers of the product are "verified" and counted in the rating | Non-buyer cannot rate |

## Payments

| ID | Rule | Test idea |
|---|---|---|
| PY-01 | Methods: cash on delivery, bank transfer, card (after gateway approval) | Card hidden while feature flag off |
| PY-02 | A repeated gateway webhook must not create a second payment | Idempotency test |
| PY-03 | Stock is decremented in the same transaction as the order | No oversell under concurrency |
