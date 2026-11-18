---
title: Clearing learning data should not copy the media being deleted
author: Khajiitvaper2017
date: 2026-11-18
branch: main
id: l-aef19647
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - src/background/handle.ts
  - src/background/system-contracts.ts
  - src/backups/components/BackupSettings.tsx
  - src/backups/reset.ts
  - src/shared/i18n/locales/en.json
  - src/shared/i18n/locales/uk.json
  - src/sync/service.ts
  - src/sync/tracking.ts
---

## Decided
Write sync tombstones from the record keys when clearing the entire learning collection. Then clear the local tables without tracking the same deletion again. Ordinary edits still use the existing dependency rules.

## Tried and ruled out
A tracked clear reads full rows and can copy the old card assets into sync dependencies before deleting them. That path can fail with Chromium DataError: Failed to write blobs (IOError), even though the user asked to free space.

## Watch out
Keep schedule and card field records in the tombstone sweep, even when they have no matching row in a learning table. Decks, dictionaries, and settings are separate from the learning reset. Scope counts use IndexedDB counts instead of loading blobs for size estimates.

In the code: src/sync/tracking.ts, src/backups/reset-scope.ts, src/backups/reset.ts, src/backups/components/ResetPreview.tsx.
