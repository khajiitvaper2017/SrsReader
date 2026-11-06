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
  - src/audio/preferences.ts
  - src/audio/pronunciations.ts
---

Wiktionary pronunciation filename prefixes include country codes, cities, and longer names; they are not a fixed list of two-letter regions. Suggested prefixes are examples, not an exhaustive dialect inventory. Do not generate suggestions from country codes alone.

A filename cannot reliably identify an accent: location may be stored in Wiktionary qualifiers or a Lingua Libre speaker profile. An unrestricted prefix match can also mistake part of a word for a dialect.

Sources: [Wiktionary audio conventions](https://en.wiktionary.org/wiki/Help:Audio_pronunciations), [Commons pronunciation requests](https://commons.wikimedia.org/wiki/Commons:Pronunciation_files_requests).
