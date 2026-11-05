---
title: Treat Anki deck paths as a hierarchy in every deck action
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-2b2aa7be
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
The user expects German::Deutsch (English) to appear as a German parent containing Deutsch (English), with expandable rows. Keeping the complete path as a single visible deck name did not meet that request. Keep Anki paths in storage and templates, but show leaf names in the tree and readable paths in selectors. Parent review, word lists, export, reschedule, clear and delete include descendants. Preserve empty parent decks when moving their last child.

## Tried and ruled out
Only filtering empty decks and changing labels left parent operations unavailable. Removing the parent prefix would lose hierarchy during export. Retaining a generated folder ID as a saved renamed deck ID can collide when the old path appears again; materialize an implicit parent with a fresh ID.

## Watch out
Recalculate due dates through the shared scheduler without resetting cards or recording answers. Imported extra fields need empty-value filtering and paragraph separators for the Words panel; keep their saved HTML intact. Reload the unpacked extension or use a fresh browser profile after rebuilding background code, because restarting a persistent profile can reuse its installed service worker.

In the code: src/srs/deck-tree.ts, src/srs/decks.ts, src/srs/reschedule.ts, src/app/pages/StudyPage.tsx, src/anki/import.ts, src/anki/export.ts, src/vocabulary/storage.ts.
