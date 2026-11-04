---
title: Use one scheduling pipeline for FSRS and RWKV
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-c25c893f
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
  - src/anki/export.ts
  - src/background/handle.ts
  - src/backups/archive.ts
  - src/backups/full-model.ts
---

## Decided
Keep FSRS-6 and FSRS-7, with 7 as the default. The user wants fewer functions and one scheduling implementation. Remove FSRS-3 through FSRS-5 rather than preserving their settings, validation, or runtime branches. This is a single-user app; do not add compatibility or recovery code for these removed versions.

FSRS and RWKV use the same defineScheduler definition and official policies. A small nextInterval middleware supplies RWKV predictions before fuzzing, learning steps, limits, and monotonic ordering. Keep RWKV inference and saved neural state specific to that model. Live answers and imported history both simulate all four RWKV ratings and use the selected scheduler result and review log. Explicit date recalculation queries the scheduler without recording an answer.

## Tried and ruled out
Separate hand-written RWKV learning transitions and interval policies duplicated the official scheduler and made import scheduling differ from live reviews. Overriding only the final scheduled interval also leaves ordering comparisons using FSRS predictions. Replace the candidate interval calculation before the built-in policies, once per shared candidate, so preview ratings retain the fuzzing and step decorators.

## Watch out
Keep FSRS-7 fractional elapsed days and FSRS-6 study-day arithmetic. Existing dates and original history remain unchanged during model-memory migration. Continue preparing the RWKV model outside import publication transactions. A learned card without any saved answers has no RWKV state; the browser fixture must record an answer before it can check RWKV rescheduling for that card.

In the code: src/srs/scheduler.ts, src/srs/answers.ts, src/srs/import-history.ts, src/srs/engines/rwkv/simulate.ts, and src/srs/reschedule.ts. The removed duplicate implementations were src/srs/transitions.ts and src/srs/intervals.ts.
