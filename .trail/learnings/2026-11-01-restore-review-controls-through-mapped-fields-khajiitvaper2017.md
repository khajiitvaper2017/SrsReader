---
title: Restore review controls through mapped fields while preserving Anki templates
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-80af401a
scope: repo
status: active
src: agent
touches:
  - docs/en/dictionaries.md
  - docs/en/review.md
  - docs/uk/dictionaries.md
  - docs/uk/review.md
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - src/app/App.tsx
  - src/app/pages/DocsPage.tsx
  - src/app/pages/ReviewPage.tsx
---

## Decided
Keep review content in the shared HTML/CSS/JS template renderer. Restore sentence translation with the existing host control, passing its displayed text into a temporary copy of the native note's mapped Translation field. Showing or hiding a review translation must not write note fields or modify imported templates.

Center native sentences and the saved POS heading in the native note-type stylesheet. Update only reader note types. Keep imported HTML, CSS, scripts and alignment intact. The status badge uses a centered grid column with controls in the right column.

## Tried and ruled out
Padding the Paper outside ScrollArea inset the scrollbar from the card edge. Keep Paper padding zero and put spacing inside the scrollable content. Rendering the template's saved Translation field alone lost the existing Translate/Show original control and ignored visibility settings.

## Watch out
Verify native and imported cards separately. Browser checks covered translate/hide, centered status/sentence/POS, scrollbar at the card border, and an imported card retaining left-aligned CSS and executing its original JavaScript. A database upgrade check verified that imported fields, templates, scripts and schedules remain unchanged.

In the code: src/app/pages/ReviewPage.tsx, src/translation/components/SentenceTranslation.tsx, src/cards/defaults.ts, src/platform/database/migrations.ts.
