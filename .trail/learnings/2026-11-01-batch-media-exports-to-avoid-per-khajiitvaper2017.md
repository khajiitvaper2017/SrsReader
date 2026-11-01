---
title: Batch media exports to avoid per-file storage latency
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-566a7b5a
scope: repo
status: active
src: agent
---

## Decided
Export media concurrently in batches limited to 16 files and 16 MB because awaiting each browser Blob and ZIP entry serially dominated large exports. Read small batch files into byte-array readers; stream oversized files. Reuse each prepared note type per media namespace because thousands of notes share the same template.

## Tried and ruled out
The serial Watching export advanced from 13,513 to 15,399 media files over two 30-second observation intervals, about 31 files per second. Bounded concurrent writes and byte-array readers exported the full 26,071 files in 168 seconds including database preparation. Polish exported in 24 seconds and passed native Anki validation of fields, tags, templates, styles, review counts, suspension, and all media bytes.

## Watch out
Do not queue the whole media collection at once because pending ZIP entries can buffer complete files. Keep stable numeric entry names and the media map, even when writes complete out of order. Namespace-specific template preparation must remain separate when filenames collide across imported packages.

In the code: src/anki/export.ts bounds Promise batches, uses Uint8ArrayReader for bounded small files and BlobReader for large files, and caches raw models by note type and namespace.
