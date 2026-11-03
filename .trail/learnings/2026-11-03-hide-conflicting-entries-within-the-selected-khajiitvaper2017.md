---
title: Hide conflicting entries within the selected word
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-950d6f2a
scope: repo
status: active
src: agent
touches:
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/dictionaries/components/Meanings.tsx
  - src/dictionaries/lookup.ts
  - src/dictionaries/grammar.ts
---

## Decided
When contextual grammar conflicts with a dictionary entry, hide its definitions by default even if other entries for the same headword fit. Let the dictionary's Show more arrow reveal hidden entries. Keep the red conflict tags and their explanations.

## Tried and ruled out
Filtering the word selector alone leaves mixed parts of speech visible under the selected headword. In mit seinen Paraden, the popup showed the verb sein before the possessive entry even though it flagged the verb tag red.

## Watch out
A single headword can contain both matching and conflicting entries from one dictionary. Apply the same grammar rules at entry level and keep the dictionary header with Show more when every entry in the group is hidden.

In the code: src/dictionaries/components/Meanings.tsx uses grammarConflicts from src/dictionaries/grammar.ts for entry visibility and tag explanations. wordMatchesGrammar in that module still handles whole word candidates.
