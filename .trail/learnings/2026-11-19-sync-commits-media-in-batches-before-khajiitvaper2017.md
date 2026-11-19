---
title: Sync commits media in batches before publishing the merge
author: Khajiitvaper2017
date: 2026-11-19
branch: main
id: l-aea4775f
scope: repo
status: active
src: agent
touches:
  - src/platform/database/db.ts
  - src/shared/i18n/locales/en.json
  - src/shared/i18n/locales/uk.json
  - src/sync/components/SyncSettings.tsx
  - src/sync/drive.ts
  - src/sync/merge.ts
  - src/sync/metadata.ts
  - src/sync/model.ts
  - src/sync/processing.worker.ts
  - src/sync/service.ts
---

## Decided
Commit downloaded media in bounded transactions and publish references with the merged collection and merge history in one transaction. Existing readers and backups still receive Blobs.

## Tried and ruled out
A persistent headless Chromium profile with a 1,024-file limit reproduced Failed to write blobs (IOError) when one transaction copied 3,300 attachments. Smaller put requests inside a single commit do not bound Chromium's concurrent file writes. The extension's sync worker successfully merged 1,500 media records and applied a later replacement under the same limit using separately committed media.

## Watch out
Keep the backing media until no published row or retained merge record references it. Delete an unfinished stage by key. Use measured transfer counts and separate labels for merge and commit instead of estimating duration from unequal phases.

In the code: src/sync/metadata.ts, src/sync/merge.ts, src/platform/database/media-links.ts.
