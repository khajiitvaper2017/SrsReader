---
title: Keep layout boundaries out of dictionary phrase whitespace
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-ae0efa0a
scope: repo
status: active
src: agent
touches:
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/background/handle.ts
  - src/dictionaries/commands.ts
  - src/dictionaries/components/Meanings.tsx
  - src/dictionaries/contracts.ts
  - src/dictionaries/grammar.ts
  - src/dictionaries/lookup.ts
  - src/dictionaries/resolve.ts
  - src/languages/analysis.ts
---

## Decided
Use a paragraph separator for synthetic boundaries between independent layout items. Dictionary phrase matching must reject matches containing this separator. Keep ordinary line breaks and inline link/text continuity available to phrases.

## Tried and ruled out
A newline stopped direct concatenation of unrelated labels but did not prevent a known phrase from joining them: the phrase matcher accepts any whitespace. Separate inline-block controls labelled oben and genannt still matched oben genannt.

## Watch out
Normalization changes string length. Phrase end offsets must map normalized matches back to the source text, including soft hyphens and decomposed accents. The complete German dictionaries confirmed oben ge\u00adnannt and gru\u0308ner Star need source-length mapping.

In the code: src/reader/blocks.ts emits U+2029 for layout boundaries; src/reader/scan.ts rejects cross-boundary phrases and maps normalized phrase ends with Intl.Segmenter; src/languages/text.ts excludes U+2029 from abbreviation and suspended-list whitespace.
