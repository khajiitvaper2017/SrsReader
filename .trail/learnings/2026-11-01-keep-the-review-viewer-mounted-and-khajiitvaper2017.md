---
title: Keep the review viewer mounted and consume the preload media cache
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-aed2ea56
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
Keep the review Paper and CardViewer mounted when the active word changes. Replacing the Paper with a key based on word identity destroyed the isolated viewer, its loaded state and displayed document on every answer. Preserve the displayed frame until the next styled document is ready; show the loader only before the first card.

Preload visual data for the current and next two queued cards independently of audio downloads. The live CardViewer must consume that same media promise cache. Cache asset reference sets with namespace outside the sorted filename list, so changing sentence text can reuse media without mixing packages. Keep at most six sets and invalidate them with content/collection changes. Reset review scrolling only after the replacement card reports readiness.

## Tried and ruled out
Waiting for resources inside the viewer did not fix transitions while its parent kept remounting it. Preloading sentences/audio/ranks alone left template assets on the critical display path. Serial preparation also let a slow audio download block later visual preparation.

## Watch out
Check the entire transition, not only the final visible card. A real browser check delayed rendering by 600 ms, watched every animation frame for viewer remounts, hidden frames and loading indicators, and counted IndexedDB reads. It verified that upcoming media was read before grading and was not read again on activation. Keep Blob URLs scoped to their consuming opaque document; cache stored assets rather than sharing URLs between frames.

In the code: src/app/pages/ReviewPage.tsx, src/cards/components/CardViewer.tsx, src/srs/preload.ts, src/srs/hooks/useReviewPreload.ts, src/cards/sandbox/assets.ts.
