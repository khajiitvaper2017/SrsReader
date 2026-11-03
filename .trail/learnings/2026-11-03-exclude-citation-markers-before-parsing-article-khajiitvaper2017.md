---
title: Exclude citation markers before parsing article text
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-b9f90601
scope: repo
status: active
src: agent
touches:
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/dictionaries/components/Meanings.tsx
  - src/dictionaries/lookup.ts
  - src/languages/analysis.ts
  - src/languages/udpipe.ts
  - src/reader/blocks.ts
---

## Decided
Exclude semantic Wikipedia citation markers before sending text to the contextual parser. A marker immediately after a period can change the token boundaries and grammatical tags that the parser returns for the preceding word. The reader can separately remove double quotation marks that the parser attaches to word tokens.

## Tried and ruled out
Stripping trailing periods from parsed tokens was insufficient for the reported article. The live German model attached part of the citation to the word when the citation was at the end of the request. It also treated Dr. as a valid token without an abbreviation feature, so trimming periods would damage legitimate tokens.

## Watch out
Request boundaries affect the result. Test the exact extracted paragraph at the end of the request, as well as inside a batch. Do not infer the parser's response to real page text from a synthetic token alone.

In the code: src/reader/blocks.ts excludes superscript references by semantic markup or citation ID. src/languages/analysis.ts normalizes attached double quotes for reader ranges. The live model used was german-hdt-ud-2.17-251125.
