---
title: Reject literal phrase misses before running regular expressions
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-cab30ffb
scope: repo
status: active
src: agent
touches:
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/background/handle.ts
  - src/background/start.ts
  - src/dictionaries/components/Meanings.tsx
  - src/dictionaries/lookup.ts
  - src/languages/analysis.ts
  - src/languages/morphology.ts
  - src/languages/udpipe.ts
  - src/lookup/commands.ts
---

## Decided
Use a whitespace-normalized literal prefix to reject dictionary phrase candidates before compiling or running the exact regular expression. Keep the exact expression for word boundaries and source offsets.

## Tried and ruled out
The scan summary on a fresh page showed about 11 seconds of dictionary work outside the measured stages. A Chromium fixture with 12,000 phrases sharing the same prefix reproduced the gap. Across 48,000 phrase rows, phrase matching dropped from 9.6 seconds to 95 ms after the literal check. The phrase database query took about 0.65 seconds in both runs.

## Watch out
Use separate clean browser profiles for cold comparisons. Reloading the same text warms UDPipe and can warm dictionary caches. The shared prefix index is broad, so a single phrase-heavy dictionary can produce a large candidate set even on a short page.

In the code: src/reader/scan.ts performs the literal check before its existing phrase regex and includes phrase matching in the scan summary.
