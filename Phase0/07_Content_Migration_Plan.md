# Content Migration Plan (Base44 prototype to production)

## What exists (from the analysis)
- 18 gifts, 14 feelings, 8 occasions, 6 recipient groups, 11 categories.
- Five categories and the Child recipient group each hold only 1 gift.
- Reviews and testimonials are sample content. Images show blurred placeholders. Phone number and social links are placeholders.
- Recipient hub gift counts: 8 / 11 / 8 / 13 / 9 / 1.

## Steps
| # | Step | Owner | When |
|---|---|---|---|
| 1 | Ask who owns the Base44 app and whether data export is possible (Q6) | Product owner | Wk 1 |
| 2 | If export is possible, export Product, Review and StoreConfig. If not, capture the 18 gifts from the live site | BA | Wk 1–2 |
| 3 | Build a product spreadsheet: slug, name, description, price, offer price, type, stock, lead time, made-to-order, perishable, allowed extras, categories and tags | BA | Wk 2 |
| 4 | Studio supplies final photography and copy | Studio | By Wk 14 |
| 5 | Write an idempotent seed script (B1) that fills data/taxonomy.json and data/products.json: re-runnable, validates tags against the taxonomy | Backend dev | B1 |
| 6 | Do not import sample reviews or ratings. Start with zero reviews so that ratings show only verified ones | Tech lead | B1 |
| 7 | Dry-run import on staging, then again before launch | Backend dev | B1, B6 |

## Content gaps to close before launch
- Photographs for every product.
- Products for the thin categories and the Child group.
- Real phone number, social links and brand pages.
- Product-level rules: made-to-order flag, lead time, allowed extras (Q5).
- Reviewed privacy policy and terms (Q11).
