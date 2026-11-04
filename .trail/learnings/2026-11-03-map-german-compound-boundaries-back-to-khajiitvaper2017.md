---
title: Map German compound boundaries back to the written spelling
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-94165339
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
  - src/lookup/components/Lookup.tsx
  - src/lookup/hooks/useLookupWord.ts
---

## Decided

Compare the parser lemma and written compound with ß and ss treated alike, then translate every split boundary back to an actual character boundary in the page. An attested genitive singular redirect may resolve the final part when the parser leaves the suffix in place.

## Tried and ruled out

The popup already split Partikelgrössenbereich, but the reader rejected it in the article because the parser's ss makes its boundary one character later than the page's ß. Treating both spellings as equal while keeping the parser offset would still put the highlight on the wrong character.

## Watch out

HDT removes the final s in the Wikipedia sentence, while GSD keeps it. The German Wiktionary archives link Bereichs to Bereich as genitive singular. Do not accept arbitrary redirects as compound components.

In the code: src/reader/scan.ts maps lemma offsets to the surface, and src/dictionaries/lookup.ts allows attested genitive redirects for the final head. Verified with both model responses and with UDPipe off.
