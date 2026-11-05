---
title: Prefer attested weak plural stems without classifying whole headwords as obsolete
author: Khajiitvaper2017
date: 2026-11-05
branch: main
id: l-32994234
scope: repo
status: active
replaces: l-96389048
src: agent
touches:
  - src/dictionaries/lookup.ts
---

## Decided
Prefer the dictionary-attested lemma plus n plural stem before the general ambiguous-inflection fallback. Schützen directly attests Schütze plus n; it need not become an ambiguous query that defaults to Schütz. Apply this in the shared compound resolver so page scans and direct lookups agree. Keep all original dictionary meanings and usage tags.

## Tried and ruled out
A proposed obsolete-headword filter was removed before committing. The user correctly pointed out that Schütz is current: its neuter senses describe a contactor or sluice gate, while only its masculine rifleman sense is marked veraltet. A usage tag on one meaning cannot classify the whole headword. The original failure came from the ambiguity branch taking precedence over the existing attested plural-stem branch, not from missing dictionary data.

## Watch out
This is a morphological preference, not full semantic disambiguation of homographs. The existing boundary heuristic still needs context when morphology alone cannot distinguish senses. Do not blacklist Schütz or other words based on one obsolete meaning.

In the code: lookupGermanCompounds pluralStem. The temporary assertion harness uses the real graph traversal and compound splitter with all 1326002 de-de archive rows. It checks Fallschirmschützenabzeichen and Fallschirmschützenlehrgang to Schütze, Blasengröße to Blase, Truppenfallschirm unchanged, and Schütz retained in ordinary lookup. Changing obsolete tags does not change the plural-stem choice.
