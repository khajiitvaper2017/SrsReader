---
title: Prefer longer left parts when German compound boundaries tie
author: Khajiitvaper2017
date: 2026-11-05
branch: main
id: l-8e96c577
scope: repo
status: active
replaces: l-14ddf659
src: agent
touches:
  - src/dictionaries/lookup.ts
---

## Decided
Keep dictionary-backed compound paths with any number of parts. Keep the existing priorities for explicit hyphens, fewer parts, linking letters and exact forms. When equally ranked paths have different boundaries, compare them from left to right and prefer the longer part at the first difference. Still reject competing dictionary lemmas when the written boundaries are the same.

## Tried and ruled out
Rejecting every tied split left Fliegereinheit without any parts. The complete German-English Wiktionary archive has Flieger, Einheit, Fliege and Reinheit, but no Fliegereinheit headword. Both Flieger + Einheit and Fliege + Reinheit have the same score. An extra dictionary match for an incidental alternative must not suppress the useful split.

## Watch out
This boundary preference is a heuristic, not a decision based on sentence meaning. Explicit hyphens must retain priority, so Fliege-Reinheit keeps that written split. Do not use this rule to choose between different inflected dictionary lemmas at identical boundaries. Retain the existing source offsets and bounded dynamic-programming search.

In the code: src/dictionaries/lookup.ts splitGermanCompound bestSplit. Dictionary evidence: wty-de-en revision 2026.10.22, 602286 rows.
