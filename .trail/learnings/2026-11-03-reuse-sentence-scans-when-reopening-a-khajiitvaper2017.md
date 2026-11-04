---
title: Reuse sentence scans when reopening a lookup
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-530ea832
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
Keep completed sentence or block scans in the scan cache and keep dictionary highlight updates in the rendered block. When opened mode can reuse a completed sentence scan even when the selected span has no grammar occurrence.

## Tried and ruled out
Checking for a grammar occurrence alone is insufficient. The full abbreviation o. g. is a dictionary span with no matching grammar token. The old path deleted its cached sentence on every open, and automatic mode requested another scan even after the page scan finished.

## Watch out
A successful dictionary lookup can update one word before a scan finishes. Do not let that partial highlight replace the full scan. Count scan messages when checking repeated lookup latency because popup rendering and unrelated background scans can change timing.

In the code: src/reader/scanner.ts prepareLookup, applyParsedTerm and applyScanResult, and src/reader/popup.ts refineContext.
