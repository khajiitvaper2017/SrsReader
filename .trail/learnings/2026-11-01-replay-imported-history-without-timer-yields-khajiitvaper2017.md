---
title: IndexedDB transaction lifetime needs real-browser verification
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-98156d9c
scope: repo
status: active
src: agent
---

Timer yields during import-history replay can leave Chromium's IndexedDB transaction inactive even under Dexie.waitFor; nested waitFor wrappers can hang. Replay already runs in a dedicated worker, so timer yields are unnecessary for UI responsiveness. In-memory IndexedDB adapters do not reproduce this browser limitation.
