# Vendor Evaluation

I have not verified any vendor's current terms, pricing or onboarding time. Candidate names come from general knowledge and must be confirmed with each vendor in Week 1–2. Use the criteria to score them.

## 1. Payment gateway (start first: longest lead time)

Candidates to check: PayFast, Safepay, a bank-hosted gateway from the studio's own bank, and wallet options (JazzCash, Easypaisa). International processors such as Stripe may not onboard Pakistani merchants, so confirm before relying on them.

| Criterion | What to ask |
|---|---|
| Onboarding | Documents required, approval time, test (sandbox) access before approval |
| Methods | Cards, wallets, bank transfer, instalments |
| Integration | Hosted payment page, webhooks, idempotency, refund API |
| Cost | Per-transaction fee, setup fee, settlement time, minimum volume |
| Fit | Node.js SDK or clean REST docs, signed webhooks |

Fallback (already in the plan): launch with cash on delivery and bank transfer, with the card module behind a feature flag.

## 2. Courier / dispatch

Candidates to check: TCS, Leopards, PostEx, Trax, BlueEx, M&P. Also consider the studio's own riders for same-day in Karachi.

| Criterion | What to ask |
|---|---|
| Coverage | Karachi, Lahore, Islamabad, Rawalpindi, Sargodha, and the 7 mid-tier cities |
| Same-day | Order cut-off and daily capacity per city |
| API | Booking, tracking webhook, label printing, cash-on-delivery remittance |
| Cost | Rate per city against the fees (350 / 400 / 550 / 650) |
| Handling | Fragile and gift items, failed-delivery rules (two attempts, then contact) |

Decision output: courier APIs or dispatch rota (Q8), Sargodha fee and timing (Q7).

## 3. Transactional email (scheduled)
Needs: templates, scheduled sending to the minute (or our own worker triggers sends), bounce handling, good delivery to Pakistani mailboxes. Candidates: Amazon SES, SendGrid, Postmark, Mailgun. Check price per thousand and sender domain setup (SPF, DKIM, DMARC).

## 4. SMS / WhatsApp
Needs: delivery calls and recipient notices. WhatsApp Business API needs approved templates and a business account, which can take time. Check local SMS providers for Pakistan sender-ID rules.

## 5. Others
- Object storage and CDN: S3-compatible provider, a bucket for public product images and a private bucket for customer photos.
- Google sign-in: a Google Cloud project and OAuth client.
- Error monitoring and uptime: Sentry-class tool plus an uptime checker.
- Hosting: Vercel (decided). Durable write storage is open (risk R1 in the architecture document).

## Decision log (fill in)
| Vendor area | Chosen | Date | Decided by | Notes |
|---|---|---|---|---|
| Payment gateway | | | | |
| Courier | | | | |
| Email | | | | |
| SMS / WhatsApp | | | | |
| Cloud / hosting | | | | |
