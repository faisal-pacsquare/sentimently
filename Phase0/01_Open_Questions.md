# Open Questions Log

Each question blocks a specific piece of work. "Default" is what the team will build if no answer arrives by the due date; it can be changed later at a cost.

| ID | Question | Blocks | Owner | Due | Default if unanswered |
|---|---|---|---|---|---|
| Q1 | Can guests check out without an account? (FAQ answer was not opened.) | Customer and order model, checkout API (B2, B4) | Product owner | Wk 1 | Guests allowed. Order is tied to an email, and an account can be claimed later. |
| Q2 | What do the account pages, orders, wishlist, reminders and the checkout form look like? | Backlog accuracy, ERD | BA with test account | Wk 1 | Use the inferred model in 03_Data_Model.md. |
| Q3 | Which payment gateway? Is bank transfer confirmed manually or reconciled automatically? | Payments module (B4) | Tech lead and product owner | Wk 2 | Manual confirmation by studio staff in admin. |
| Q4 | Is an Urdu interface needed? | Content model, API (translatable fields) | Product owner | Wk 2 | English only. Text fields kept in a way that allows adding a language later. |
| Q5 | Does "Express same-day dispatch" (+Rs 600) apply to made-to-order items? The necklace is 5–7 working days yet offers it. | Pricing engine (B3) | Product owner | Wk 2 | Not applicable to made-to-order items. Per-product allowed-extras list. |
| Q6 | Who owns the Base44 app, and can catalogue content and images be exported? | Content migration | Product owner | Wk 1 | Re-enter the 18 gifts manually from the live site. |
| Q7 | What fee and delivery time for Sargodha? Is same-day possible there? | Delivery rates, courier choice | Product owner and courier | Wk 2 | Rate set to the Rs 550 / 1–2 working days tier until confirmed. |
| Q8 | Which courier model: courier APIs or a studio dispatch rota? | Fulfilment module (B5) | Tech lead and studio | Wk 2 | Dispatch rota with manual tracking updates. Courier API added later. |
| Q9 | Which production states exist, and when exactly does a personalised item count as "in production"? | Cancellation rule, order state machine | Studio staff | Wk 2 | Production starts when staff mark the item "in production" in admin. |
| Q10 | Daily same-day capacity per city? | Same-day cut-off logic | Studio | Wk 3 | Configurable setting, unlimited at start. |
| Q11 | Privacy policy and terms were not read. What retention applies to customer photos and messages? | Data retention, deletion feature | Product owner | Wk 3 | Delete photos 90 days after delivery. Support deletion on request. |
| Q12 | Real contact number, social links, brand pages? (Prototype has +92 000 0000000 placeholders.) | Content and store config | Studio | Wk 3 | Placeholders stay hidden until supplied. |
| Q13 | Do reviews need moderation before publishing? | Reviews module | Product owner | Wk 2 | Publish verified-customer reviews immediately. Admin can hide. |
| Q14 | Can a gift-link recipient decline or reroute a gift? Do links expire? | Gift link module | Product owner | Wk 3 | No expiry set in the plan. Default 30 days, claimable once. |
| Q15 | Is cash on delivery available for digital gifts and gift links? | Payment rules | Product owner | Wk 2 | COD for physical orders with a known address only. |

Note on Q14 and Q15: the source plan does not state these rules, so the defaults are my proposals, not facts from the prototype.
