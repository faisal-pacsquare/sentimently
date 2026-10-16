# Loading the real catalogue

The studio fills in two spreadsheets (save each as **CSV, comma separated**). The import checks every row and
writes the data files only if everything is valid, so a typo can never half-load the shop.

`*.sample.csv` are made-up examples to practise on (every name starts with SAMPLE). Do not import them for real.
`templates/` holds the empty sheets with the right column names.

```bash
# 1. Check only. Nothing is written.
npm run build
npm run import:catalogue -- --taxonomy samples/taxonomy.sample.csv --products samples/products.sample.csv --out ./data --dry-run

# 2. For real
npm run import:catalogue -- --taxonomy taxonomy.csv --products products.csv --out ./data
```

Running it again with a corrected file **updates** gifts (matched by `slug`); it does not create duplicates.
Ratings and review counts of existing gifts are kept.

## taxonomy.csv: the groups people browse by
| Column | Meaning |
|---|---|
| kind | `sentiment` (the feeling), `occasion`, `recipient` (who it is for) or `category` |
| slug | short web name: lower-case words joined by hyphens, e.g. `i-miss-you`. Never change it later |
| name | what customers see |
| blurb, image | optional text and picture for the group page |
| sortOrder | number; smaller shows first |

The plan has **14 feelings, 8 occasions, 6 recipient groups and 11 categories**. Other counts are reported as warnings.

## products.csv: the gifts
| Column | Meaning |
|---|---|
| slug, name, description | web name (unique), title, text (at least a sentence) |
| price, offerPrice | whole rupees, `3500` or `Rs 3,500`. offerPrice is optional and must be lower |
| type | `physical` or `digital` |
| digitalKind | digital only: `egift` (12-month code) or `greeting` |
| stock | how many are in the studio. Ignored for made-to-order gifts |
| category | the slug of one category |
| sentiments, occasions, recipients | slugs separated by `\|`, e.g. `i-miss-you\|thank-you` |
| allowedExtras | extras this gift may have, separated by `\|`: `premium_wrap`, `keepsake_box`, `chocolate_box`, `dried_flower_posy`, `express_same_day`. Leave empty to allow all except express on made-to-order gifts |
| isMadeToOrder, leadTimeMinDays, leadTimeMaxDays | `yes`/`no`, and the working days to make it (the maximum is required for made-to-order) |
| isPerishable | `yes` for flowers and food. These can't be scheduled more than 3 days ahead |
| isActive | `no` hides it from the shop |
| imageUrls | web addresses or paths starting with `/`, separated by `\|` |

A description that has a comma or a line break must be in double quotes (Excel does this when saving as CSV).
