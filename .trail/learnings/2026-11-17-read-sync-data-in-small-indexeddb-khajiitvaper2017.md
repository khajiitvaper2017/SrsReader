---
title: Read sync data in small IndexedDB values
author: Khajiitvaper2017
date: 2026-11-17
branch: main
id: l-b5c15e68
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - src/sync/drive-index.ts
  - src/sync/merge.ts
  - src/sync/processing.ts
  - src/sync/processing.worker.ts
  - src/sync/service.ts
  - src/sync/tracking.ts
---

## Decided
Store staged snapshot records, merge history, media references, and Drive file metadata in separate rows because Chromium reads oversized structured-clone values from a separate backing file and can fail before returning the row. Save the compressed outgoing payload because a retry must use identical bytes.

## Tried and ruled out
Do not read legacy outgoing snapshots to check whether one exists. Dexie can read values to count a query with multiple disjoint keys, so use a key-only lookup. When replacing a legacy outgoing snapshot, advance the revision because Drive can already have the old name reserved for different bytes.

## Watch out
The captured snapshot and Drive index are rebuildable caches. The merge frontier can contain conflict history and retained dependencies. Migrate it in a transaction because discarding it can change later merges.

In the code: src/sync/metadata.ts, src/sync/tracking.ts, src/sync/processing.worker.ts, src/sync/service.ts, and src/sync/drive-index.ts.
