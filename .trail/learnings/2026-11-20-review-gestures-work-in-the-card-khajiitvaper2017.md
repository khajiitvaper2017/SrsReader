---
title: Review gestures work in the card content and blank space
author: Khajiitvaper2017
date: 2026-11-20
id: l-1de7e6cb
scope: repo
status: active
src: agent
touches:
  - entrypoints/card-viewer/main.ts
  - src/app/pages/ReviewPage.tsx
  - src/cards/sandbox/input.ts
  - src/cards/sandbox/render.ts
  - src/shared/i18n/locales/en.json
  - src/shared/i18n/locales/uk.json
  - src/srs/components/ReviewControls.tsx
---

## Decided
Use the same gesture recognizer in the scrollable review panel and the sandboxed card. List the directions under Settings → Controls → Review controls.

## Tried and ruled out
Listening only inside the sandbox let swipes work on card content while the blank space below short cards ignored them. A headless check at phone width confirmed that blank-space clicks and swipes work with the panel listener.

## Watch out
Keep vertical scrolling available on long questions. A swipe up reveals only once the end is visible. Interactive controls and text selection keep their existing behavior.

In the code: src/app/pages/ReviewPage.tsx, src/cards/sandbox/input.ts and render.ts, and src/srs/components/ReviewControls.tsx.
