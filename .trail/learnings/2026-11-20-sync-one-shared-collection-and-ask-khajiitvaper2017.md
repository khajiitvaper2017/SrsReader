---
title: Sync one shared collection and ask before replacing conflicting copies
author: Khajiitvaper2017
date: 2026-11-20
branch: main
id: l-8b615914
scope: repo
status: active
replaces: l-de7c205b
src: agent
touches:
  - e2e/extension.ts
  - src/anki/import.ts
  - src/app/pages/StudyPage.tsx
  - src/backups/archive.ts
  - src/backups/full.ts
  - src/backups/restore.ts
  - src/imports/commands.ts
  - src/platform/database/db.ts
  - src/platform/database/media-links.ts
  - src/platform/database/migrations.ts
---

## Decided
Use one current Drive collection for cards, history, portable settings, and the attachment list. Upload or download automatically when one side changed. Ask which copy to keep when both changed. Seed the new format from a device that already has the complete collection.

## Tried and ruled out
Per-device snapshot histories and record-level merge rules were more complexity than this workflow needed. A mutable shared file would let simultaneous writers silently replace each other. Publish verified copies before deleting only the copies they supersede, so concurrent candidates survive for the user to choose.

## Watch out
Keep media bytes separate from the chosen attachment list. Local writes invalidate cached SHA-256 values. A review-only upload skips the attachment upload stage. Keep media writes bounded, preserve older local backing links until replacement, and leave old Drive snapshots and unused Drive files alone. Retain the offscreen host only after the first real sync job starts so consecutive jobs do not race host closure.

In the code: src/sync/service.ts, src/sync/collection.ts, src/sync/tracking.ts, src/sync/media.ts.
