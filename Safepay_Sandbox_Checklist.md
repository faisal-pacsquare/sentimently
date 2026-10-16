# Safepay card payments: setup and sandbox checklist

Decision: card payments use **Safepay** (hosted checkout, PKR). Chosen because it has a free sandbox and no card data ever touches our server. Production fees and merchant approval (KYC) are **not known yet** and need to be confirmed with Safepay before launch.

Code: `sentimently-api/src/orders/safepay.gateway.ts`. It is used automatically when the settings below are present; otherwise card stays switched off (`NullGateway`).

## 1. Set up (about 15 minutes, needs a Safepay sandbox account)

1. Create a sandbox merchant account at Safepay and open the sandbox dashboard.
2. Copy the **public API key** and the **secret key** (Developers > API keys).
3. Developers > Endpoints > add an endpoint: `https://<your-api-host>/api/v1/payments/webhook`, subscribe to `payment.succeeded` and `payment.failed`, and copy its **shared secret**. This is a different value from the secret key.
4. Set these on the API (Vercel env vars, or `.env` locally):

| Variable | Value |
|---|---|
| `SAFEPAY_ENV` | `sandbox` (later `production`) |
| `SAFEPAY_API_KEY` | public key |
| `SAFEPAY_SECRET_KEY` | secret key. Server only; never in the web app |
| `SAFEPAY_WEBHOOK_SECRET` | the endpoint's shared secret |
| `APP_URL` | where the storefront lives, e.g. `https://shop.example.pk`. Also used for the links in emails; shoppers return here after paying |
| `FEATURE_CARD_PAYMENTS` | `true` |

`GET /api/v1/store` then lists `card` in `paymentMethods` and the storefront shows "Debit or credit card".

A webhook must reach a public HTTPS address, so test on a deployed preview (or a tunnel), not plain `localhost`.

## 2. What the code assumes, to check in the sandbox

These come from Safepay's public documentation and SDK source, not from a live account. Each is marked `VERIFY` in the code. Run one real sandbox payment with a test card and confirm each line.

| # | Assumption | How to check | If wrong, change |
|---|---|---|---|
| 1 | Amount is sent in **paisa** (Rs 1,150 sent as 115000) | The sandbox payment shows Rs 1,150, not Rs 11.50 or Rs 115,000 | `createCharge`, `* 100` |
| 2 | Session endpoint `POST /order/payments/v3/` with `intent: CYBERSOURCE`, `mode: payment` | Checkout opens without a 4xx | `createCharge` body |
| 3 | Hosted checkout link `https://sandbox.api.getsafepay.com/embedded/?environment=sandbox&tracker=..&tbt=..&source=hosted&redirect_url=..&cancel_url=..` | Link opens a Safepay payment page, not an error | `CHECKOUT_HOST` and the query names |
| 4 | Webhook header `X-SFPY-SIGNATURE` = HMAC-SHA512 (hex) of the **raw body** with the endpoint secret | Webhook returns 200 and the order becomes **paid**. A 401 means the signature or secret is wrong | `parseWebhook` |
| 5 | Event types `payment.succeeded` / `payment.failed`, with the tracker (`track_...`) somewhere inside `data` | A test payment marks the order paid. If the answer is `ignored`, the payload differs | `findTracker` and the type check |
| 6 | `GET /reporter/api/v1/payments/{tracker}` returns state `TRACKER_ENDED` once paid, and our order number under `metadata.order_id` | Order becomes paid, not left waiting (503 retries) | `parseWebhook` (`state`, `order_id`) |
| 7 | The charged amount appears under `purchase_totals` in the report | If missing the amount check is skipped (safe: the amount is fixed when we create the session). Better to confirm it is found, so a mismatch is caught | amount lookup |
| 8 | Failed attempt: shopper can retry on Safepay's page; we only mark the payment failed on `payment.failed` | Pay with a declining test card, then a good one: the order ends **paid** | n/a |

## 3. Flow checks (all in the sandbox)

- Pay successfully: return page says "Confirming", then "we have your payment"; order is `paid` in the admin queue; the confirmation email is sent.
- Press Cancel on the Safepay page: return page says "Payment not completed", the order is cancelled, stock is back, and the gift box is still there.
- Close the tab after paying: the webhook alone still marks the order paid.
- Replay the same webhook (dashboard Test Webhook): nothing changes a second time.
- Forged webhook (wrong signature): 401, order unchanged.
- Safepay unreachable while placing the order: shopper sees "could not be started", the order is cancelled and stock returned.

## 4. Known gaps

- **Refunds** to cards are manual: refund in the Safepay dashboard, then mark the refund done in the admin. The adapter has no refund call yet.
- **Abandoned payments**: if a shopper closes the Safepay page without paying or cancelling, the order stays `awaiting_payment` and holds its stock until someone cancels it. An automatic expiry (for example after 2 hours, using the existing scheduler) is a good next addition.
- Wallets (Easypaisa, JazzCash) are offered by Safepay's own page if enabled on the merchant account; we do not control that.
- Production needs Safepay approval and its fees confirmed (see decision above).
