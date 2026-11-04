---
title: Remove soft hyphens for analysis and retain original text positions
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-aefcc587
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/background/handle.ts
  - src/dictionaries/commands.ts
  - src/dictionaries/contracts.ts
  - src/dictionaries/grammar.ts
  - src/dictionaries/lookup.ts
  - src/dictionaries/resolve.ts
  - src/languages/analysis.ts
---

## Decided
Remove discretionary soft hyphens from dictionary keys and UDPipe input. Map UDPipe's cleaned token positions back to the original source, including the soft hyphens in the stored written token. Keep source text and DOM positions unchanged.

## Tried and ruled out
Intl.Segmenter already treats schle­si­schen as one word, but UDPipe can split its soft hyphens and dictionary keys do not contain them. Removing them only at lookup time cannot repair a split contextual analysis.

## Watch out
Previously cached analyses of soft-hyphen text contain the old split. Use a distinct cache fingerprint for affected text. Verify the next token's range, lookup from different points in the written word, and cache reuse.

In the code: src/languages/text.ts normalize, src/languages/udpipe.ts processBatch and cacheKey, src/languages/conllu.ts parseConllu. Verified the supplied Prinzessin Nadeschda sentence against the supported German HDT model and without UDPipe.
