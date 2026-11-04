---
title: Open the attested whole word for marked German compounds
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-15f8d087
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
Look up the original German spelling and the joined spelling in the same dictionary batch. Use the joined headword when the marked spelling lacks a match and the installed dictionaries define the joined noun. Keep the marked source text in the reading example.

## Tried and ruled out
Resolving the split first makes the popup open a component even when the entire noun has a definition. The six marked spellings of Donaudampfschifffahrtsgesellschaftskapitän all join to the same entry in the German and English Wiktionary archives. Brackets around a linking letter mark the letter, so joining must keep the letter itself.

## Watch out
A trailing hyphen can mark an omitted ending, so do not join suspended forms this way. When the whole noun is known, keep the component links inside the popup. Check the popup and saved lemma as well as the scan span.

In the code: src/languages/text.ts joinedGermanCompound, src/dictionaries/lookup.ts lookupMany, src/reader/scan.ts scanTexts.
