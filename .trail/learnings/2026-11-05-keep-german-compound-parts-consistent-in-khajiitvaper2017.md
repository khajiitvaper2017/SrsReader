---
title: Keep German compound parts consistent in page and direct lookups
author: Khajiitvaper2017
date: 2026-11-05
branch: main
id: l-1245e5a1
scope: repo
status: active
src: agent
touches:
  - src/dictionaries/lookup.ts
  - src/reader/scan.ts
  - src/reader/scanner.ts
---

## Decided
Resolve compound stems through exact dictionary headwords with matching noun or verb tags: lande to landen and Gebirg to Gebirge. Support an infinitive as the final part of a prefixed nominalization. Give inferred stems an extra cost so direct noun and linking-letter paths retain priority. Map a parser lemma's unchanged compound prefix to the page and let the final inflected head change its vowel or ending. Dictionary-backed marked compounds may split even when the parser calls the whole expression a proper name.

Use the same pointer-based compound selection for automatic and on-lookup loading. Reuse a cached block scan by translating its sentence ranges instead of requesting a new scan for each popup.

## Tried and ruled out
Luftlandetruppen, Luftlandeoperation and Luftlandewelle need the verb landen; treating e only as a noun linking letter would show Land instead. A prefix-only check on Verband versus Verbänden rejected Heeresverbänden even after the lemma split correctly. The proper-name guard prevented Flieger-Division from using splits already available in the popup. Automatic popup refinement required a whole-word grammar occurrence, which split parts intentionally do not have.

The German dictionary also defines the archaic verb heeren. Without an extra inferred-stem cost, Heer plus es tied with heeren plus s in Heeresverband and prevented its split.

## Watch out
Keep competing inferred stems ambiguous. Validate exact dictionary headwords and parts of speech instead of following arbitrary variant chains. Preserve single proper names. Keep saved grammar occurrences in their original analysis coordinates while translating scan and related ranges to a sentence. Verify cold and cached direct lookup in both loading modes; reopening must reuse the scan.

In the code: src/dictionaries/lookup.ts lookupGermanCompounds and splitGermanCompound; src/reader/scan.ts scanTexts; src/reader/scanner.ts prepareLookup. Evidence used both supplied Fallschirmjäger paragraphs, the German HDT response and complete wty-de-en (602286 rows) and wty-de-de (1326002 rows) archives, revision 2026.10.22. Checks used storage and DOM adapters, not a browser.
