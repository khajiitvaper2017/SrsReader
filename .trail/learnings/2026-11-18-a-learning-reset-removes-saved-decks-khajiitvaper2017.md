---
title: A learning reset removes saved decks without copying deleted media
author: Khajiitvaper2017
date: 2026-11-18
branch: main
id: l-d626a31f
scope: repo
status: active
replaces: l-aef19647
src: agent
touches:
  - AGENTS.md
  - src/backups/components/ResetPreview.tsx
  - src/backups/reset-scope.ts
  - src/imports/commands.ts
  - src/shared/i18n/locales/en.json
  - src/shared/i18n/locales/uk.json
  - src/sync/tracking.ts
---

## Decided
Clear saved decks with the rest of the learning collection. Study reads saved deck rows, so clearing only their cards leaves empty deck names in the list. The built-in Mined words row is virtual. Write sync tombstones from record keys, then clear the local tables without tracking the same deletion again.

## Tried and ruled out
A tracked clear reads full rows and can copy old assets into sync dependencies before deleting them. Chromium can fail those writes with DataError: Failed to write blobs (IOError).

## Watch out
Keep schedule and card field records in the tombstone sweep. Keep installed dictionaries and settings outside the learning reset. Chromium's separate "Page failed to load." error comes from creating the offscreen processing page, before snapshot upload. Retry the page load without consuming queued changes.

In the code: src/backups/reset-scope.ts, src/backups/components/ResetPreview.tsx, src/sync/tracking.ts, and src/imports/commands.ts.
