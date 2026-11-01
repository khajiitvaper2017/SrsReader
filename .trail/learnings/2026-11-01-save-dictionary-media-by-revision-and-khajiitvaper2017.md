---
title: Save dictionary media by revision and allow large backup values
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-839369b9
scope: repo
status: active
src: agent
touches:
  - docs/en/review.md
  - docs/uk/review.md
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - src/app/pages/DocsPage.tsx
  - src/app/pages/ReviewPage.tsx
  - src/app/pages/StudyPage.tsx
  - src/audio/components/AudioButton.tsx
  - src/audio/hooks/usePronunciation.ts
---

## Decided
Dictionary snapshots use stable asset names derived from the dictionary revision and source path. Embedded images become named assets. Refresh requires all local media before publishing. Migration alone tolerates missing old dictionary media so an uninstalled dictionary cannot prevent startup.

The full-backup parser must accept media values larger than 10 MiB. A 9.1 MB Japanese font expands beyond this limit as base64. Patch the existing library's parser limit rather than changing the backup format or loading the whole backup as JSON.

## Tried and ruled out
Reusing a filename based only on dictionary and path overwrote assets still referenced by sibling notes after a refresh. Leaving data URIs in generated fields prevented portable media ownership. The unmodified backup library exported large fonts successfully but then rejected its own export on restore.

## Watch out
Validate refresh before writing any fields or assets. Test unpacked extension background changes with a fresh profile or explicit extension reload: Chrome can reuse the cached service-worker script while loading updated hashed app chunks, giving misleading results.

In the code: src/cards/snapshot.ts, src/platform/database/migrations.ts, patches/dexie-export-import@4.4.2.patch, src/backups/full.ts.
