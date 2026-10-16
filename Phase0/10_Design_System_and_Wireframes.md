# Design System and Wireframes (Phase 0 spec)

This is the design specification. It is a Phase 0 deliverable and does not start frontend implementation. Implementation begins after the Backend Gate. Mobile-first, since gifting is mostly phone traffic. English, left-to-right.

## 1. Brand principles
- Start from the feeling, not the product.
- Warm, personal, unhurried. The message is the hero, so text gets generous space.
- Never hide a cost: extras, delivery fee and discount are always shown before payment.

## 2. Tokens

| Token | Value | Use |
|---|---|---|
| Color / ink | #2B2230 | Text |
| Color / paper | #FFF9F5 | Page background |
| Color / rose (primary) | #C2456B | Primary buttons, links |
| Color / rose-dark | #9E2F52 | Hover, pressed |
| Color / sage (success) | #4F7F68 | Success, free delivery |
| Color / amber (warning) | #B7791F | Cut-off and lead-time notes |
| Color / red (error) | #B3261E | Errors |
| Color / line | #E8DDD5 | Borders |
| Font / heading | Serif display (e.g. Fraunces) | Titles, feeling names |
| Font / body | Humanist sans (e.g. Inter) | Everything else |
| Scale | 12 / 14 / 16 / 20 / 24 / 32 / 40 | Type sizes |
| Spacing | 4-pt grid: 4, 8, 12, 16, 24, 32, 48 | |
| Radius | 8 (cards), 999 (chips, pills) | |
| Breakpoints | 360, 768, 1100 | Mobile, tablet, desktop |

All text/background pairs meet WCAG AA contrast (4.5:1). The final values are confirmed with a contrast check when implemented.

## 3. Components
Button (primary, secondary, ghost), Chip (feeling/occasion filter), Product card, Rating stars, Badge ("On offer", "Digital"), Price block (list/offer), Filter bar and drawer, Search field, Gift-box line, Stepper (quantity), Message editor (counter to 900, starter lines), Card-design picker, Extras checklist with prices, Live preview panel, Date and time picker, Address form, Order status timeline, Toast, Inline error state, Empty state, **Retry-able error state** (distinct from "not found"), Skeleton loaders, Modal and drawer, Admin data table, Status pill.

## 4. Storefront wireframes (key screens)

### Home (mobile)
```
[ announcement: Free delivery over Rs 5,000 · COD ]
[ logo ]            [search] [account] [gift box (n)]
---------------------------------------------------
  Every Feeling Deserves a Gift
  [ I miss you ] [ I'm sorry ] [ Thank you ] ...
  [ Browse all feelings ]
---------------------------------------------------
  By occasion:  (Birthday) (Anniversary) ...
  Popular gifts: [card][card][card]
  How personalising works  |  Gifts across distance
  Reviews (verified only)
[ footer: tracking · shipping · FAQ · contact ]
```

### Shop All / hub
```
[ filters: Feeling ▾ Occasion ▾ Recipient ▾ Category ▾ Type ▾ Budget ▾ ]   [ Sort ▾ ]
[ card ][ card ]
[ card ][ card ]       n results · [ Load more ]
States: loading skeleton · empty ("No gifts match") · error ("Something went wrong. Retry")
```

### Product page
```
[ gallery ]
 Name · ★ 4.8 (verified reviews only)
 Rs price (offer)   Lead time: 5–7 working days · made to order
 Stock: n left
 [ Personalise ]  [ Add to gift box ]
 Tabs: Details · Returns · Sizing · Reviews
```

### Personalisation studio
```
 Step 1 Who is it for?   Name* [____]  Relationship [▾ 8 options]
 Step 2 Your message     [ textarea ] 0/900   Starter lines  [Help me write it]
 Step 3 Card design      ( ) ( ) ( ) ( )       Step 4 Packaging & extras (prices)
 Step 5 Photos (if supported)
 ---- Live preview ----           Running total: Rs ...
 [ Add to gift box ]  (disabled until name entered)
```

### Gift box and checkout
```
 Gift box lines + extras
 Delivery:  ( ) Enter address   ( ) Send a gift link
 Date/time (cut-off note: "order before 1pm for same day")
 Promo [____] [Apply]
 Payment: ( ) Cash on delivery ( ) Bank transfer ( ) Card
 Read-back of message  → [ Confirm and pay ]
 Totals: items · extras · delivery · discount · TOTAL
```

### Recipient gift-link claim
```
 "Someone sent you a gift" (no sender details)
 Address [____] City [▾] Phone [____]   [ Claim gift ]
 Used link → "This gift has already been claimed"
```

### Order tracking
```
 Order number [____]  Email [____]  [Track]
 Status timeline only (no address, no contact details)
```

### Digital gift
```
 Choose e-gift card (Rs 5,000) / greeting card (Rs 500)
 Recipient email · message · Send now / Schedule (date + time)
```

## 5. Admin console wireframes
- **Orders queue:** table with status pills, filters (status, city, date), bulk status change, order detail drawer (message, card, packaging, photos, address).
- **Production board:** columns Preparing · In production · Ready to dispatch, with a "start production" action that locks cancellation.
- **Catalogue:** product table, edit form (tags, lead time, made-to-order, allowed extras, images, stock).
- **Settings:** delivery rates per city (including Sargodha), free-delivery threshold, same-day cut-off and capacity, promo codes, banner.
- **Inbox:** contact messages and bulk-gifting enquiries.
- **Reviews:** moderation list. **Reports:** sales, status, delivery performance, promo use.

## 6. UX rules
1. A failed request shows a retry state, never "not found" (prototype finding 1).
2. Cut-off and lead-time messages appear before the customer commits.
3. Mobile touch targets are at least 44 px.
4. Every form validates inline and keeps the customer's input on error.
5. Keyboard and screen-reader support on all interactive components.
