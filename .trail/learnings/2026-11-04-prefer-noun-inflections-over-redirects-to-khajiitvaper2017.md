---
title: Prefer noun inflections over redirects to personal names when splitting compounds
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-82abd147
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/background/handle.ts
  - src/dictionaries/commands.ts
  - src/dictionaries/contracts.ts
  - src/dictionaries/grammar.ts
  - src/dictionaries/lookup.ts
  - src/dictionaries/resolve.ts
  - src/languages/analysis.ts
---

## Decided
When a compound ending has several inflected matches, prefer meanings explicitly tagged as common nouns. Keep multiple noun lemmas ambiguous. If there are no common nouns, retain the existing candidates.

## Tried and ruled out
The Zuckerkristalle failure also occurred without an inline link. Wiktionary resolves Kristalle to the noun Kristall and follows a name variant from Kristall to Christel. Both results carry the plural label, so treating every inflected result as equally eligible rejected the ending.

## Watch out
A lemma can have both common-noun and proper-name meanings. Classify each meaning using its own tags. Check the linked text as well as the popup's component links.

In the code: src/dictionaries/lookup.ts lookupGermanCompounds readLemmas. Verified the actual German and English Wiktionary archive rows.
