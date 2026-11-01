---
title: Replay imported history without timer yields in the worker
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-98156d9c
scope: repo
status: active
src: agent
---

## Decided
Keep historical replay in the dedicated import worker. Report progress without timer yields during the FSRS calculation loop. One Dexie.waitFor covers the complete publication transaction, including settings preparation and replay. Use an explicit long timeout because large packages can exceed the default 60 seconds.

## Tried and ruled out
In-memory IndexedDB checks passed with setTimeout yields every 500 answers. Actual Chromium failed at the final reviews.clear with TransactionInactiveError. Moving a single waitFor around the entire publication callback did not solve that failure. Removing timer yields let the real Polish package import commit all 2,101 notes, 4,202 cards, 3,979 media assets, and 5,605 reviews. Nested waitFor wrappers also hung in a minimal probe and were removed.

## Watch out
Do not restore timers just to keep the interface responsive: replay already runs in a worker. Keep publication atomic. A failed real-browser import was checked after restart and left zero notes, cards, assets, raw reviews, or normalized reviews.

In the code: src/srs/import-history.ts reports every 500 records without awaiting a timer. src/anki/import.ts owns the transaction and its sole waitFor. Test browser storage when changing these boundaries; an in-memory adapter did not reproduce this failure.
