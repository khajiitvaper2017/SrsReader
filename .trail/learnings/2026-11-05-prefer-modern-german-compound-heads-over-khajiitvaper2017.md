---
title: Prefer modern German compound heads over obsolete alternatives
author: Khajiitvaper2017
date: 2026-11-05
branch: main
id: l-96389048
scope: repo
status: active
src: agent
touches:
  - src/dictionaries/lookup.ts
---

## Decided
When several dictionary headwords accept the same German inflection, prefer candidates without obsolete usage tags. Keep the original ambiguity when several modern candidates remain. If every candidate is obsolete, retain them rather than preventing the split. This preference applies only to compound resolution; ordinary lookup keeps all meanings.

## Tried and ruled out
The complete de-de archive returns both Schütz and Schütze for Schützen. The resolver retained Schützen as an ambiguous part, then normal lookup put Schütz first. Dictionary-valid did not mean the preferred modern analysis. The Schütz headword merges a modern neuter technical noun, an obsolete masculine noun and a surname, so the obsolete tag must affect compound preference even though another sense is current. No word-specific exception was added.

## Watch out
This is a headword preference, not semantic disambiguation of every technical homograph. Modern alternatives remain ambiguous. Preserve all dictionary meanings in normal lookup and preserve the all-obsolete fallback.

In the code: lookupGermanCompounds, inflections and modernInflections. A temporary assertion harness ran the real dictionary graph traversal and compound splitter against 1326002 de-de archive rows. Fallschirmschützenabzeichen and Fallschirmschützenlehrgang resolve to Schütze. Blasengröße stays ambiguous and Truppenfallschirm is unchanged. No browser check was used.
