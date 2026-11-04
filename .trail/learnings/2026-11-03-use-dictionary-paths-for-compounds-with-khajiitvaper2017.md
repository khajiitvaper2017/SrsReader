---
title: Use dictionary paths for compounds with any number of parts
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-14ddf659
scope: repo
status: active
src: agent
touches:
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/background/handle.ts
  - src/dictionaries/commands.ts
  - src/dictionaries/contracts.ts
  - src/dictionaries/lookup.ts
  - src/lookup/components/Lookup.tsx
  - src/lookup/hooks/useLookupWord.ts
  - src/lookup/model.ts
  - src/shared/i18n/locales/en.json
---

## Decided
Use installed dictionary entries and find the best path across the compound. Prefer fewer parts, then fewer linking letters. Keep a second equally good path only to detect ambiguity. Let the reader open a dictionary-backed part to see its definition and any further split.

## Tried and ruled out
A fixed three-part splitter was too narrow. The real German–English Wiktionary archive has Partikelgröße and redirects Partikelgrösse to it, so the outer lookup can have two parts even though the German–German archive requires three. The Swiss example needs linking n as well as the Grösse-to-Größe redirect. NNSplit can predict boundaries in the browser, but its separate model does not establish that the installed dictionaries have entries for the suggested parts.

## Watch out
Use actual archive entries to verify both the immediate split and nested links. Probe prefix and suffix entries before requesting interior substrings. Do not enumerate every full partition.

In the code: src/dictionaries/lookup.ts and src/lookup/hooks/useLookupWord.ts. Verified both spellings, a four-part input, and returning to the original editor with its draft.
