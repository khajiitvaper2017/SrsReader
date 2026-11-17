---
title: Moving a deck keeps its identity and card links
author: Khajiitvaper2017
date: 2026-11-17
branch: main
id: l-47a15a7e
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - e2e/misparses.spec.ts
  - src/anki/components/AnkiCardPreview.tsx
  - src/anki/components/AnkiTransfer.tsx
  - src/anki/export.ts
  - src/anki/import.ts
  - src/anki/model.ts
  - src/anki/read.ts
  - src/app/App.tsx
  - src/app/pages/StudyPage.tsx
---

## Decided
Store the edited deck's local name and parent ID because cards already link to stable deck IDs. Build full paths for display and Anki export. Keep the former path as an anchor when editing a deck with full-path descendants because those descendants still refer to the former path.

## Tried and ruled out
Rewriting the whole subtree makes every descendant an unrelated sync update. Avoid rewriting card or descendant records to rename a deck.

## Watch out
Use deckTree for display paths and deckBranch for descendants because a legacy anchor can point to a deck whose current path is different.

In the code: src/srs/deck-tree.ts, src/srs/decks.ts, src/anki/import.ts, src/anki/export.ts.
