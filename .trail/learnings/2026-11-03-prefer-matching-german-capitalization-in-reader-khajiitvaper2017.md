---
title: Prefer matching German capitalization in reader lookups
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-310cfcb7
scope: repo
status: active
src: agent
touches:
  - src/dictionaries/lookup.ts
  - src/dictionaries/search.ts
---

## Decided
German dictionary lookup should prefer the original spelling at each step, including when an inflected form points to a base word. A folded index can still find entries when there is no exact match, such as for a word capitalized at the start of a sentence.

## Tried and ruled out
Changing the Search tab's substring matching did not fix the reader popup. The user reported that looking up Willens in Triumph des Willens still selected willen instead of Willen.

## Watch out
The reader's lookup can follow dictionary references before selecting the result. Preserve case when resolving those references as well as the original form. Do not apply a general lowercase-first ranking to German.

In the code: src/dictionaries/lookup.ts uses fetchTerms for the original token and subsequent references. src/dictionaries/search.ts is the separate Search tab path.
