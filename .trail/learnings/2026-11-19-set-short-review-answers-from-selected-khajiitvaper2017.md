---
title: Set short review answers from selected card text
author: Khajiitvaper2017
date: 2026-11-19
branch: main
id: l-2c849ddb
scope: repo
status: active
src: agent
touches:
  - entrypoints/card-viewer/main.ts
  - src/anki/components/AnkiCardPreview.tsx
  - src/anki/conversion.ts
  - src/anki/import.ts
  - src/anki/read.ts
  - src/app/pages/ReviewPage.tsx
  - src/background/handle.ts
  - src/cards/components/CardViewer.tsx
  - src/cards/components/NoteFieldsEditor.tsx
  - src/cards/model.ts
---

## Decided
Select text on the revealed card and confirm it with Use as short answer because reviewers should be able to save the exact wording they see and stay on the current card. Keep manual edits in Edit note. Import the mapped Anki word definition or translation when available.

## Tried and ruled out
A picker in Edit note required opening the editor and finding the same text again. Replacing the dictionary field with the short answer would discard useful reference material.

## Watch out
Card selection belongs to the sandboxed iframe. Forward it for the active revealed render, show what will be saved, and write the literal text only after the reviewer clicks the action. Keep dictionary content and the short answer separate because installing a dictionary must not replace the user's wording.

In the code: ReviewPage receives the selection from CardViewer. Note.reviewAnswer stores the answer. prepareStudyDocument reads live dictionary content while leaving stored fields intact.
