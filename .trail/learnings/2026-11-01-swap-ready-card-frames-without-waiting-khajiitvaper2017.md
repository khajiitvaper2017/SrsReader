---
title: Swap ready card frames without waiting for hidden animation frames
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-16948a01
scope: repo
status: active
src: agent
touches:
  - docs/en/review.md
  - docs/uk/review.md
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - src/app/App.tsx
  - src/app/pages/DocsPage.tsx
  - src/app/pages/ReviewPage.tsx
  - src/app/pages/StudyPage.tsx
  - src/audio/components/AudioButton.tsx
---

## Decided
Keep the current card document until its replacement has loaded resources and fonts. Measure the hidden replacement synchronously, then show it and remove the previous document. Send height updates only for the displayed frame. Do not add padding to a body height that already includes padding: with viewport-based minimum heights, that creates a resize feedback loop.

Update the queue's words and current card document together after grading. Removing a word optimistically while retaining the previous document shows mismatched content. Reset reveal/example state in the same update when changing cards.

## Tried and ruled out
Waiting for requestAnimationFrame before revealing a hidden iframe stalled rendering in Chromium. Waiting for load and document.fonts.ready, followed by synchronous layout measurement, works while the frame is hidden. A redundant app-level gutter rule did not help because the more specific review CSS explicitly disabled the gutter; remove that exception instead.

## Watch out
Keep the trusted input port and active-frame checks when swapping documents. Temporary browser profiles must be removed after checks. Real browser checks with delayed font readiness verified side-button grading, typing exclusions, fixed iframe height with body min-height:100vh, and stable page gutter.

In the code: entrypoints/card-viewer/main.ts, src/cards/sandbox/runtime.ts, src/cards/components/CardViewer.tsx, src/srs/hooks/useReviewSession.ts, src/shared/styles/content.css.
