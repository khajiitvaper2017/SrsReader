---
title: Sync review data before attachments and reuse identical files
author: Khajiitvaper2017
date: 2026-11-20
branch: main
id: l-de7c205b
scope: repo
status: active
src: agent
touches:
  - src/app/pages/ReviewPage.tsx
  - src/cards/components/CardViewer.tsx
  - src/cards/sandbox/input.ts
  - src/cards/sandbox/protocol.ts
  - src/cards/sandbox/render.ts
  - src/imports/commands.ts
  - src/sync/media.ts
  - src/sync/merge.ts
  - src/sync/metadata.ts
  - src/sync/model.ts
---

## Decided
Give study data and attachments independent publication and receipt tracking. Apply and publish study changes first, so a failed attachment transfer cannot undo them. Look for local media by size and SHA-256 before requesting Drive bytes, and count only remote transfers in download progress.

## Tried and ruled out
Matching the record version alone misses identical files imported separately. Each Anki import can give those files a new namespace, so matching the record key alone is also insufficient. A headless extension check with a mocked Drive verified that a matching local file under a different namespace avoided a network request.

## Watch out
Keep observation vectors separate so a study merge cannot make a later attachment edit appear to have seen media it has not received yet. Existing mixed snapshots can feed both streams. Publish new payloads under distinct immutable names and keep cached outgoing bytes until publication is acknowledged.

In the code: src/sync/service.ts, src/sync/transfer.ts, src/sync/media.ts, src/sync/merge.ts, src/sync/tracking.ts, and src/anki/import.ts.
