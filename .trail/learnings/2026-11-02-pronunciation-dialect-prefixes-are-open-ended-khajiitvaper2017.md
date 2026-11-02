---
title: Pronunciation dialect prefixes are open-ended and cannot identify every accent
author: Khajiitvaper2017
date: 2026-11-02
branch: main
id: l-c6a3be5f
scope: repo
status: active
src: agent
touches:
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/audio/cache.ts
  - src/audio/commands.ts
  - src/audio/components/AudioSettings.tsx
  - src/audio/hooks/usePronunciation.ts
  - src/audio/model.ts
  - src/audio/preferences.ts
  - src/audio/prepare.ts
  - src/audio/pronunciations.ts
---

## Decided
Wiktionary audio uses optional country codes, named cities, and longer prefixes. Accept configured filename prefixes for every study language. Keep the default language-only prefix first, including German de ahead of de-at. Dropdown entries are verified examples, not an exhaustive list of dialects.

In the code: src/audio/preferences.ts validates prefixes and lists suggestions; src/audio/pronunciations.ts matches configured and suggested prefixes, preserves two-letter regional fallback matches, and recognizes ISO 639-3 aliases. Sources: https://en.wiktionary.org/wiki/Help:Audio_pronunciations and https://commons.wikimedia.org/wiki/Commons:Pronunciation_files_requests .

## Tried and ruled out
A language code plus exactly two region letters rejects genuine prefixes such as lv-riga and fr-be-bw. An unrestricted language-anything-word pattern can instead treat part of a compound word as a dialect. For example De-ch-Laut.ogg is a recording of ch-Laut, not evidence of a Swiss recording of Laut. Do not invent regional suggestions from standard country codes alone.

## Watch out
Wiktionary qualifiers can carry location separately from the filename. Lingua Libre speaker location is in the speaker profile. Filename priority cannot classify all such recordings. Do not claim a complete dialect inventory or infer those accents from the filename. Named custom prefixes must be included in both preference validation and source discovery.
