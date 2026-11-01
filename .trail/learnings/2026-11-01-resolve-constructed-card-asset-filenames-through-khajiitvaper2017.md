---
title: Resolve constructed card asset filenames through the active frame
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-63c89250
scope: repo
status: active
src: agent
---

## Decided
Keep initial asset loading limited to referenced media and shared scripts/styles/fonts because loading every media Blob would make the Watching deck impractical. Resolve constructed local filenames on demand through a narrow frame message. The host reads only the active note media namespace and verifies the active frame and card before replying.

## Tried and ruled out
Static reference scanning and rewriting alone missed filenames assembled by scripts, so JSON fetches and dynamically created images could fail despite their files existing in the package. Preloading all media was rejected because the sample contains 26,071 entries. An actual installed-extension fixture now verifies fetch, asynchronous XHR, image properties, setAttribute, generated HTML, a packaged Japanese font, and a real 1280x720 WebM clip. A filename present only in another namespace fails as required.

## Watch out
Create Blob URLs in the consuming opaque frame because URLs from a different opaque document cannot be loaded reliably. Keep asynchronous replies tied to the current card and discard late replies after navigation. Image setters must ignore stale loads after a newer assignment. Relative URLs added with innerHTML bypass property setters, so they also require mutation observation.

In the code: src/cards/components/CardViewer.tsx handles the package-only asset requests, entrypoints/card-viewer/main.ts relays through the active inner frame, and src/cards/sandbox/runtime.ts resolves newly requested content.
