---
title: Prepare the RWKV model before publishing an import
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-9f4a55a0
scope: repo
status: active
src: agent
---

## Decided
Prepare the RWKV model under the SRS write lock before opening the publication transaction, because CacheStorage access inside that transaction stalls Chromium. Pass the loaded model to historical replay.

## Tried and ruled out
A real Chromium import of two cards and six answers stayed at zero replay progress for two minutes when replay called downloadModel inside the transaction. FSRS imports passed. Moving model cache access before the transaction made the real-model import finish with six processed answers, two independent card states, seven shared entities, and a ready scheduler.

## Watch out
Get the selected algorithm under the lock because otherwise settings can change between preparation and publication. Keep note/card/history writes atomic.

In the code: src/anki/import.ts prepares the model before db.transaction. src/srs/import-history.ts receives RwkvModel and performs no CacheStorage calls.
