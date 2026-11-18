---
title: Imported readings keep their card identity when a dictionary has no reading
author: Khajiitvaper2017
date: 2026-11-18
branch: main
id: l-e3222327
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - e2e/misparses.spec.ts
  - src/anki/conversion.ts
  - src/anki/read.ts
  - src/cards/study.ts
  - src/cards/template.ts
  - src/dictionaries/commands.ts
  - src/dictionaries/display.ts
  - src/dictionaries/lookup.ts
  - src/dictionaries/pronunciation.ts
---

## Decided
A dictionary definition without a reading can apply to an imported card with the same language and exact headword. Keep the saved word ID and card ID because review history and note links use those IDs. Treat imported phonetic notation as the preferred pronunciation. Keep independently saved dictionary entries and entries with a different specific reading.

## Tried and ruled out
Rekeying existing vocabulary and cards to an empty reading would require reconciling linked cards, history, and sync records. Matching by a folded headword would also mix German entries such as Lernen and lernen.

## Watch out
Old converted cards can have a Definitions field that contains only generated CSS. Fill it from the installed dictionary when rendering so the user's saved content does not need a rewrite or reimport. A converted import should fall back to an exact headword with an empty dictionary reading if the archive's reading has no exact dictionary match.

In the code: src/anki/conversion.ts, src/dictionaries/display.ts, src/cards/study.ts, src/cards/template.ts. The reported example uses groß and /ɡʁoːs/.
