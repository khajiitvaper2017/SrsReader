---
title: Hit-test dictionary phrases across spaces and inline elements
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-a88ddca8
scope: repo
status: active
src: agent
touches:
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/background/handle.ts
  - src/dictionaries/commands.ts
  - src/dictionaries/contracts.ts
  - src/dictionaries/grammar.ts
  - src/dictionaries/lookup.ts
  - src/dictionaries/resolve.ts
  - src/languages/analysis.ts
  - src/languages/text.ts
---

## Decided

Give an indexed dictionary phrase a range covering all its written words. Let the pointer hit the range even when the browser returns an element caret. In When opened mode, clicking an internal gap only opens a popup if the scan finds a dictionary span covering that gap.

## Tried and ruled out

Attaching a matched phrase to the first UDPipe token showed the definition from one word but gave the following word and space no shared target. Strict rectangle bounds also rejected a real click: Chrome reported clientX 72 for a visible space whose left edge was 72.046875.

## Watch out

Keep the written whitespace in reading context. Compare mouse coordinates to the pixel bounds of text ranges, and preserve contextual parser groups that already supply their own related ranges.

In the code: src/reader/scan.ts gives matched phrases full spans. src/reader/scanner.ts resolves clicks from their visual bounds. Verified o. g. and oben genannt across inline elements in Chrome with UDPipe enabled and disabled.
