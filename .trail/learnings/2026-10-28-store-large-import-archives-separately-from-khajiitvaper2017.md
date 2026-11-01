---
title: Store large import archives separately from progress updates
author: Khajiitvaper2017
date: 2026-10-28
branch: main
id: l-2c600470
scope: repo
status: active
src: agent
touches:
  - src/imports/client.ts
  - src/imports/host.ts
  - src/imports/model.ts
  - src/platform/database/migrations.ts
---

## Decided
Keep the immutable archive Blob in a separate IndexedDB row. Update only small task metadata for progress. Publish card data in one transaction after staged media is ready.

## Tried and ruled out
Keeping the archive inside the progress task appeared correct with small fixtures. A real Chromium import rewrote its 134 MB Blob on every progress update. Two temporary profiles grew to 11 GB and 4.3 GB, exhausted the temporary disk, and failed with CREATE_ITERATOR errors or hung. Changing rendering and moving replay to a worker did not solve the storage growth.

## Watch out
Do not put the Blob back into the live-query task row. Exclude transient import payloads from backups. Delete the payload after completion or failure. For Dexie transactions, use one outer waitFor owner; nested waitFor calls around timer yields can deadlock before commit.

In the code: src/imports/client.ts writes importFiles once; src/imports/host.ts reads it separately; database version 18 separates existing payloads. The current APKG files include an approximately 1.12 GB archive, so this must be checked with real browser storage rather than only an in-memory adapter.
