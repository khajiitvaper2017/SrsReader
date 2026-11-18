---
title: Commit Anki media in separate batches before publishing cards
author: Khajiitvaper2017
date: 2026-11-18
branch: main
id: l-19162c6b
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - src/anki/import.ts
  - src/backups/archive.ts
  - src/backups/full.ts
  - src/backups/restore.ts
  - src/sync/merge.ts
  - src/sync/tracking.ts
---

## Decided

Commit attachments and their automatic sync copies in bounded transactions while holding the collection write lock. Publish the imported cards, notes, decks, and reviews in one transaction after the media commits. Keep a journal entry until that transaction succeeds so failures can discard the staged rows.

## Tried and ruled out

Grouping writes inside one IndexedDB transaction does not bound the number of blob-file writes at commit. The same 3,330-card package with 3,297 media files completed under the normal Chromium limit, but the old importer stalled when Chromium could open at most 1,024 files. Separate batch commits completed under that limit.

## Watch out

Media committed before the notes can leave abandoned local and sync rows if the worker stops. Use the stage journal to clear them under the write lock before publishing sync or exporting or replacing learning data. Delete by key so recovery never reads or rewrites those blobs. A fixture with damaged media after the first batch confirmed that the import left no staged media or media sync records.

In the code: src/anki/import.ts, src/sync/tracking.ts, src/sync/merge.ts, and the learning and full backup entry points.
