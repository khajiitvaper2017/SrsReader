---
title: Use written German compounds to correct malformed parser lemmas
author: Khajiitvaper2017
date: 2026-11-05
branch: main
id: l-edec284e
scope: repo
status: active
src: agent
touches:
  - src/dictionaries/lookup.ts
  - src/dictionaries/resolve.ts
  - src/languages/analysis.ts
  - src/languages/text.ts
  - src/languages/udpipe.ts
  - src/reader/scan.ts
---

## Decided
Use dictionary-backed written compound parts before parser lemmas. Preserve the written German noun spelling when the model changes its stem. Reconstruct an unknown compound head only from a real dictionary headword. Normalize both cached and fresh parser analyses.

## Tried and ruled out
The reported last Fallschirm-Jägerdivisionen really receives Fallschirm-JÄGerdivision from German HDT. Luftlande-Kommando-Unternehmens receives laftlande-kommando-unternehme. The pinned Simplemma dictionary maps Luftlandetruppen correctly, so changing that dictionary would not fix these model errors. The full Wikipedia article was checked against the complete de-de dictionary, revision 2026.10.22, with 1326002 rows. German dictionary-native Präf and Suf tags, participle forms, inflected intermediate parts and parenthetical unit names explain several additional misses.

## Watch out
Keep multiple legitimate inflected headwords as a source query so lookup can offer all dictionary candidates. Names, unit codes and foreign bibliography text can lack German entries. Do not manufacture definitions for them. Preserve original occurrence coordinates when mapping cached block spans into a sentence.

In the code: normalizeTokens, analysisTerms, lookupGermanCompounds, splitGermanCompound, lookup, scanTexts. Temporary dictionary and DOM adapters verified article scans and cold/cached direct lookups; no browser was used.
