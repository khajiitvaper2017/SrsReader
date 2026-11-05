---
title: Skip empty import history replay before recounting lapses
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-02e225b8
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - src/anki/components/AnkiTransfer.tsx
  - src/anki/export.ts
  - src/anki/import.ts
  - src/anki/model.ts
  - src/anki/read.ts
  - src/app/App.tsx
  - src/app/pages/StudyPage.tsx
  - src/app/pages/WordsPage.tsx
  - src/background/handle.ts
---

## Decided
Recount lapses from active answer records. Again on a Review card adds a lapse; learning and relearning failures do not. If a recorded scheduler state is unavailable, use the original Anki review type when it identifies a review failure. The user allows Anki import schedules, histories and counters to be recalculated rather than preserving Anki's exact values. This applies to Anki import, not the separate requirement to preserve due dates when migrating an existing FSRS model.

## Tried and ruled out
The supplied German package imports with 18 recalculated lapses in a fresh profile, versus 14 stored by Anki; its Words panel displays nonzero counts. A general live-scheduler lapse failure did not reproduce. Recounting repaired deliberately zeroed stored counts, including a card currently in relearning.

A package that only added unreviewed cards stalled in publication when an empty history replay was awaited before the recount. Returning early from the recount when there were no answers did not fix the stall alone. Skipping replay entirely when the event list is empty completed the import.

## Watch out
Keep existing content must preserve layouts as well as field values when adding new notes. Include template bodies and CSS in a note type's version hash, computed once per model. Merge fields and templates by stable Anki IDs, with names as the fallback. Keep existing ordinal slots so reordering templates does not duplicate cards. Preserve extra field contents and their media. The update choice is explicit; it does not implement Anki's separate modification-time policies or deck-preset import.

In the code: src/anki/import.ts, src/anki/merge.ts, src/anki/read.ts, src/srs/lapses.ts, src/srs/reschedule.ts. Verification used isolated Chromium extension profiles and temporary package variants with reordered and renamed fields, an extra local template and media, new notes, repeat imports, and keep-content updates.
