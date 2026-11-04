---
title: Keep dictionary spacing after a lookup updates highlights
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-1cc21679
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
Keep the dictionary query and the written text separate when a successful lookup updates the highlight. Preserve the page's capitalization and use the whitespace from the successful query for later lookups.

## Tried and ruled out
Checking the first popup alone misses the regression. Chromium opened the dictionary definition for d. h. before the highlight update and then sent the written nonbreaking space on reopening. The dictionary entries used ordinary spaces.

## Watch out
Test reopening after the highlight broadcast, including clicking the internal space. The reading context must still contain the original page text.

In the code: src/reader/scanner.ts applyParsedTerm updates spans in response to the parsed event.
