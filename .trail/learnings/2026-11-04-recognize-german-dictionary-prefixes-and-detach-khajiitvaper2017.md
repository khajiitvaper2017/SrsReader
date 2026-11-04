---
title: Recognize German dictionary prefixes and detach parser separator hyphens
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-0476c9d8
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - README.md
  - docs/README.md
  - docs/en/anki.md
  - docs/en/data.md
  - docs/en/dictionaries.md
  - docs/en/getting-started.md
  - docs/en/reading.md
  - docs/en/review.md
  - docs/uk/anki.md
---

## Decided
Use dictionary entries tagged pref, prefix or Präfix as the first part of a German compound. Keep the prefix's dictionary hyphen while mapping its range to the written letters. Normalize a parser token's leading separator hyphen only when the preceding token ends at the same position with a letter. Apply the same normalization to scan terms and cached occurrence grammar.

## Tried and ruled out
The German HDT parser returns nicht and -deutschsprachige as separate tokens in the supplied Deutschland paragraph, with lemma -deutschsprachig. The whole word deutschsprachige already has a dictionary redirect to deutschsprachig. Changing dictionary morphology alone would leave the incorrect source range and cached grammar token intact. The complete wty-de-en revision 2026.10.22 contains anti- tagged pref and französische as an adjective inflection, but the existing noun prefix probes cannot find anti-.

## Watch out
Do not strip all leading hyphens: standalone suffix forms such as -sprachig must keep them. Source ranges must start after a separator hyphen, while a dictionary prefix such as anti- can cover the written letters anti without inserting punctuation into the page. The existing unhyphenated adjective-ending path requires a lowercase word; sentence-initial capitalized forms were not extended in this change. Checks used the exact live parser response and all 602286 German-English dictionary rows with storage stubs, not a browser.

In the code: src/languages/analysis.ts normalizeTokens, src/languages/udpipe.ts occurrenceAnalysis and compoundGrammar, src/dictionaries/lookup.ts splitGermanCompound and lookupGermanCompounds.
