---
title: Theme the outer iframe canvas during asynchronous height changes
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-7c7327e8
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
Apply the app theme and an explicit background to the outer card-viewer document, not only the inner rendered card. Give the embedding iframe the same background. The outer viewport keeps its old height until its height message reaches React, so its uncovered area must already have the correct color.

## Tried and ruled out
Keeping the viewer mounted, caching media and hiding unfinished inner frames prevented loaders but did not cover the outer canvas. DOM readiness and visibility checks missed its white paint. The user's performance trace captured a styled 192 px card inside the previous 644 px outer viewport; the remaining 452 px painted white for one captured frame before the parent resize.

## Watch out
Check actual pixels during a tall-to-short card transition. A browser check held the parent resize for 800 ms and captured the uncovered canvas. Its sampled pixels stayed RGB(16,16,16) in dark mode. Keep the isolated documents and trusted-input handling intact.

In the code: entrypoints/card-viewer/main.ts, src/cards/components/CardViewer.tsx. Evidence: the user-provided performance trace at approximately 793 ms, followed by outer-frame layout at approximately 794 ms.
