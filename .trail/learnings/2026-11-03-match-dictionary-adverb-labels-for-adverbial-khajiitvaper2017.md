---
title: Match dictionary adverb labels for adverbial negation particles
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-738b8dad
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
  - src/lookup/components/Lookup.tsx
  - src/lookup/hooks/useLookupWord.ts
  - src/lookup/model.ts
---

## Decided

Accept a dictionary's adverb label when the parser reports a negative particle that functions as an adverbial modifier. Keep the parser's actual part of speech in the grammar popup and in conflict explanations.

## Tried and ruled out

Recognizing the dictionary's particle tag alone fixes the German–German entry but still hides the ordinary English translation of nicht. German–English Wiktionary marks that sense as adv alone. Its dated interjection is a separate entry.

## Watch out

A dependency relation and a part of speech describe different properties. Do not use advmod by itself to allow an adverb entry for every particle.

In the code: src/dictionaries/grammar.ts handles dictionary aliases Ptkl and intj. Match ADV for a token tagged PART, Polarity=Neg, and advmod. The German–German Wiktionary row is Ptkl Adv. The German–English rows are adv and intj dated formal.
