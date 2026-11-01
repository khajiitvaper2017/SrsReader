---
title: Capture configured review inputs before card scripts run
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-2fb47bf6
scope: repo
status: active
src: agent
touches:
  - docs/en/review.md
  - docs/uk/review.md
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - src/app/pages/DocsPage.tsx
  - src/app/pages/ReviewPage.tsx
  - src/app/pages/StudyPage.tsx
  - src/audio/components/AudioButton.tsx
  - src/audio/hooks/usePronunciation.ts
---

## Decided
Review key and mouse events inside isolated card documents must reach the existing review-control handler. Install input capture before package scripts run, use the saved bindings and the same matcher, and suppress trailing mouse events locally so Back and Forward do not navigate browser history.

A private MessagePort carries only trusted user input from the inner card frame. The port is transferred before imported scripts exist and its bound sender stays in a closure. The outer frame ignores input messages on the general window-message channel and closes the old port when replacing a card document. The host validates the active frame/card and input payload before dispatching to its normal review controls.

## Tried and ruled out
A listener on the review page alone cannot receive events from an iframe. Relaying grading actions through the existing general message channel would let imported scripts forge them. Synthetic DOM events must not enter the trusted input path.

## Watch out
Keep the serialized binding matcher self-contained. Do not expose the input port or sender on window. Editing fields must keep keyboard input. Real browser checks verified Mouse Back → Again, Mouse Forward → reveal/Good, keyboard grading, editing exclusions, and rejection of script-generated events/messages.

In the code: src/cards/sandbox/input.ts, src/cards/sandbox/render.ts, entrypoints/card-viewer/main.ts, src/cards/components/CardViewer.tsx, src/srs/controls.ts, src/srs/hooks/useReviewControls.ts.
