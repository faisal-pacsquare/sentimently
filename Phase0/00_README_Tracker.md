# Phase 0 Tracker (Weeks 1–3, 2–20 Nov 2026)

**PHASE 0 CLOSED 14 Oct 2026** (see 12_Phase0_Closeout.md). Backend phase B1 has started. Studio and Base44 input is not awaited. Open questions are closed by the plan's defaults (09_Decisions_Log.md).
Status: DONE = written and consistent with the plan. DRAFT = written, needs a human review pass. TODO = not started.

| # | Plan deliverable | File | Status |
|---|---|---|---|
| 1 | Requirements and backlog | 06_Backlog.md, 11_Acceptance_Criteria.md | DONE |
| 2 | Open questions closed | 01_Open_Questions.md, 09_Decisions_Log.md | DONE (by default) |
| 3 | Business rules as testable specs | 02_Business_Rules.md | DONE |
| 4 | Data model (JSON collections) | 03_Data_Model.md, sentimently-api/src/storage, sentimently-api/data | DONE |
| 5 | Architecture, API conventions | 04_Architecture_and_API_Conventions.md | DONE |
| 6 | Design system and wireframes (storefront and admin) | 10_Design_System_and_Wireframes.md | DRAFT (spec only; designer to turn into visual design) |
| 7 | Environments, CI/CD | 08_Environments_CICD.md, vercel.json, .env.example, ci.yml | DONE (files). Vercel project not yet created |
| 8 | Payment gateway and courier approach | 05_Vendor_Evaluation.md, 09_Decisions_Log.md | DONE (working choices, adapters) |
| 9 | Content migration plan | 07_Content_Migration_Plan.md | DONE (seed from the analysis) |
| 10 | Login-protected pages review | n/a | SKIPPED by decision (inferred model used) |
| 11 | Gateway merchant application | n/a | Runs outside the build; card payments behind a feature flag |

## Not yet done in Phase 0
- The Vercel project and preview/production environments (need a Vercel account).
- Storage is in memory for now (MemoryDriver). Create the free Upstash Redis from the Vercel Marketplace later; the driver is written and tested and activates when its environment variables exist.
- Photo upload storage (not covered by R1).
- Visual design files from the designer.

## Exit gate (end of Week 3)
Scope, designs, architecture and vendor approach signed off, then B1 starts 23 Nov 2026.
