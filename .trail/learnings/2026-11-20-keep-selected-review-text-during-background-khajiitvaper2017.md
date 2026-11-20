---
title: Keep selected review text during background refreshes
author: Khajiitvaper2017
date: 2026-11-20
branch: main
id: l-bffc23f2
scope: repo
status: active
src: agent
touches:
  - entrypoints/card-viewer/main.ts
  - src/app/pages/ReviewPage.module.css
  - src/app/pages/ReviewPage.tsx
  - src/cards/components/CardViewer.tsx
  - src/cards/sandbox/protocol.ts
  - src/cards/sandbox/render.ts
  - src/cards/sandbox/runtime.ts
  - src/shared/ui/UIProvider.tsx
---

## Decided
Open a menu beside selected card text with Dictionary lookup and Use as short answer. Double-click selects a word. Keep the ordinary browser text selection and forward the selected range's position out of the sandboxed document.

## Tried and ruled out
Opening lookup on double-click interrupted selection. The inline short-answer action also resized the review panel while the user was selecting text. Recreating the inner frame for a new object with equivalent settings or dictionary filenames cleared the browser selection.

## Watch out
Keep the active render and card checks on forwarded selection messages. Keep actual card and appearance updates working. The selected text is saved only when the user chooses the menu action.

In the code: src/shared/ui/UIProvider.tsx, src/cards/components/CardViewer.tsx, src/cards/sandbox/runtime.ts, entrypoints/card-viewer/main.ts, and src/app/pages/ReviewPage.tsx.
