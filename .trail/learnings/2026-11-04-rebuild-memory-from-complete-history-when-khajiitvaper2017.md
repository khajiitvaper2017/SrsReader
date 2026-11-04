---
title: Rebuild memory from complete history when changing FSRS versions
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-60390d7e
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - README.md
  - docs/en/review.md
  - docs/uk/review.md
  - package.json
  - pnpm-lock.yaml
  - src/shared/i18n/locales/en.json
  - src/shared/i18n/locales/uk.json
  - src/srs/commands.ts
  - src/srs/components/SrsSettings.tsx
---

## Decided
Use the explicit ts-fsrs model APIs for FSRS-3, 4, 4.5, 5, 6 and 7. Default the user's selection to FSRS-7. Store the model version with each card's FSRS memory. When changing versions, replay complete active history since the latest memory reset before rescheduling review cards. Keep saved answers unchanged and preserve learning steps and dates. FSRS-7 consumes fractional elapsed days; older models keep the existing study-day calculation.

## Tried and ruled out
Do not seed FSRS-7's fast stability from the old stability or from a made-up constant. Its dual-trace state must come from replay. Check history before saving a requested version, so an incomplete history cannot strand a user after changing their setting. Existing RWKV cards keep their current auxiliary FSRS memory version until FSRS is activated.

## Watch out
Old production cards without a stored model version use FSRS-6. Keep old scheduler identifiers valid in learning backups. The import replay stays synchronous inside its existing worker transaction; do not add timer yields. Manual calculation checks covered all six model versions, fractional same-day elapsed time and existing RWKV card memory. Browser interaction with the extension was not checked.

In the code: src/srs/engines/fsrs.ts, src/srs/model.ts, src/srs/reschedule.ts, src/srs/commands.ts, src/srs/history.ts and src/srs/import-history.ts. ts-fsrs 6.0.0 requires Node.js 24 or newer.
