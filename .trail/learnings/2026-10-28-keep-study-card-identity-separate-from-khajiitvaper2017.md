---
title: Keep study card identity separate from dictionary word identity
author: Khajiitvaper2017
date: 2026-10-28
branch: main
id: l-f92b644e
scope: repo
status: active
src: agent
touches:
  - src/vocabulary/model.ts
  - src/dictionaries/lookup.ts
---

## Decided
Imported and app-created cards must share one card format. Card and note identity must remain independent of dictionary word identity. The Japanese sample contains distinct notes with the same written word and reading but different contexts and histories. It also contains identical spellings with different readings. A shared lexical link can support dictionaries without merging those notes or schedules.

## Tried and ruled out
A separate AnkiCard model was rejected because the app should have one card format. Reusing the dictionary word ID for every imported note or card would collapse distinct source notes and sibling cards. The exact unified schema and live-versus-snapshot dictionary behavior remain under study; do not treat one evaluated variant as approved implementation.

## Watch out
Preserve raw field values and keep optional word and reading mappings separate from presentation. A configured Anki sort field is not necessarily the word field: the Senren sample sorts on miscInfo. Kana readings must retain their existing spelling and NFC normalization. Do not infer readings from spelling or merge cards by written word alone.

In the code: src/vocabulary/model.ts defines wordId(language, lemma, reading) and currently stores a single schedule in Vocabulary. src/dictionaries/lookup.ts groups dictionary entries by that full identity. The relevant integration boundary is note/card identity versus the lexical identity used by dictionaries, audio, sentences, and reader state.
