---
title: Keep attested slash forms through dictionary phrase matching
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-3cf9dac2
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/reader/scan.ts
  - src/dictionaries/management.ts
---

## Decided
Split parser tokens containing words on both sides of a slash through the existing word segmenter. Preserve attested slash forms through the existing dictionary phrase index.

## Tried and ruled out
Always splitting slash forms would break real German headwords. The complete wty-de-en archive, revision 2026.10.22, has 602286 rows and 21 unique slash headwords, including und/oder, E/A, km/h and 08/15. No separate slash exception mechanism is needed because import already indexes these as phrases.

## Watch out
Einw. is absent from that archive. A scanner check must not expect a dictionary match for it. Preserve trailing-slash abbreviations such as m/; they are not two words separated by a slash. Scanner checks used dictionary headwords with lookup/storage stubs, not a live browser.

In the code: src/reader/scan.ts filters combined slash analyses before building candidates. src/dictionaries/management.ts builds the existing phrase index.
