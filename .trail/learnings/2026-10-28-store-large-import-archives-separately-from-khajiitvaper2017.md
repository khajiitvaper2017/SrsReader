---
title: Store large import archives separately from progress updates
author: Khajiitvaper2017
date: 2026-10-28
branch: main
id: l-2c600470
scope: repo
status: active
src: agent
touches:
  - src/imports/client.ts
  - src/imports/host.ts
---

Keep immutable archive Blobs separate from frequently updated IndexedDB task rows. Chromium can rewrite the full Blob on each progress update, causing storage growth that small fixtures and in-memory adapters do not expose.
