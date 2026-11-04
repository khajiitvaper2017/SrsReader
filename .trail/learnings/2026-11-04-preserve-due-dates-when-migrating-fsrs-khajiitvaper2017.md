---
title: Preserve due dates when migrating FSRS memory with the official scheduler
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-e2fac707
scope: repo
status: active
replaces: l-60390d7e
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
Use ts-fsrs v6 defineScheduler with explicit model entries, the app's study-day chronology, and the documented retention, fuzzing, statistics, interval and learning-step middleware. FSRS-7 uses fractional elapsed days and its own weights. Preserve each card's model and weights together with memory. Rebuild learned memory with Reschedule.replay only after verifying complete, consistent history since the latest reset. Preserve due dates, progress, suspension, IDs and original review records. Keep unmigratable cards on their previous model and report the skipped count. Preview a requested version change without writes before confirming it.

## Tried and ruled out
The initial implementation called model methods directly and automatically recalculated dates while changing FSRS versions. The user's approved correction plan follows the official migration guide instead. Counting rows and matching the last timestamp was insufficient to establish complete history. Check the pre/post-review chain after the latest reset. Never fabricate FSRS-7 fast stability or convert old records into invented v6 rollback logs. Use returned v6 logs for new reviews and retain the application's old snapshots as historical data.

## Watch out
Imports append new reviews without rewriting old records. Replay by actual time and recorded sequence for equal-time answers. RWKV preparation therefore uses a time/sequence index and a processed-row cursor rather than renumbering historical records. Keep its import preparation outside publication and keep replay in the worker without timer yields. Undo must read settings before its IndexedDB transaction. New and old-model cards can coexist after a partial migration. The new storage fields require database version 23; learning exports use format 6 and can read production format 5. Full backups still require their matching database format.

In the code: src/srs/engines/fsrs.ts, src/srs/model.ts, src/srs/reschedule.ts, src/srs/history.ts, src/srs/undo.ts, src/srs/import-history.ts, src/srs/engines/rwkv/storage.ts and src/platform/database/migrations.ts. Verification uses e2e/fsrs.spec.ts in an isolated Chromium extension profile.
