---
title: Recognize written German compounds across parser token boundaries
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-2a5a459e
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
  - src/languages/text.ts
  - src/lookup/commands.ts
  - src/lookup/components/Lookup.tsx
---

## Decided

Find a hyphenated German compound in the written text even when UDPipe splits it into several tokens. Keep the punctuation and source offsets for lookup. Use dictionary matches to prefer visible boundaries while allowing short syllable breaks such as don-au to rejoin.

## Tried and ruled out

The same word, Produkt-Eigenschaftsfunktionen, was one token in HDT and three in GSD. Both models split the bracketed long example differently. Using parser token boundaries alone misses the written compound in at least one model.

## Watch out

German–English Wiktionary marks Funktionen with a slash-separated list of cases and a plural definite label. Recognize the dictionary's inflected head so the final en is not offered as a separate word.

In the code: src/languages/text.ts recognizes hyphenated spans, src/dictionaries/lookup.ts retains source offsets, and src/reader/scan.ts uses the written span and replaces its contained tokens only when the compound splits. Browser checks used both exact strings and both German UDPipe models.
