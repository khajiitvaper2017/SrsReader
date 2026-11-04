---
title: Use grammatical inflection paths to resolve compound endings
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-61b7ccd5
scope: repo
status: active
replaces: l-82abd147
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
A candidate compound ending may resolve through dictionary redirects only when every redirect label describes a supported noun inflection. Keep genuine competing inflected lemmas ambiguous.

## Tried and ruled out
Preferring noun meanings fixed a reduced fixture but failed with the complete dictionaries. Kristalle resolves to Kristall, then a name-variant chain through Christel eventually reaches the common nouns Christin and Christ. Their inherited plural label does not make them inflections of Kristalle. The complete archive import reproduced the reported failure.

## Watch out
Do not validate only one label on a redirect path. Variant, abbreviation, and gender-derived noun links can inherit an earlier plural label. Use the actual archive graph when checking ambiguous endings.

In the code: src/dictionaries/lookup.ts lookupGermanCompounds readLemmas validates every word.forms label.
