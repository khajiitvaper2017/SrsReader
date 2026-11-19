---
title: Transient notifications share one floating stack
author: Khajiitvaper2017
date: 2026-11-19
branch: main
id: l-b8f3d026
scope: repo
status: active
src: agent
touches:
  - package.json
  - pnpm-lock.yaml
  - src/anki/components/AnkiTransfer.tsx
  - src/app/App.tsx
  - src/app/pages/ReviewPage.tsx
  - src/backups/components/BackupSettings.tsx
  - src/imports/client.ts
  - src/lookup/components/Lookup.tsx
  - src/lookup/hooks/useLookupWord.ts
  - src/settings/hooks/useSettingsTask.ts
---

## Decided
Show transient feedback in the shared bottom-right notification stack because it lets the user continue studying without moving the card or its controls. Results close automatically.

## Tried and ruled out
An inline auto-bury notice shifted the review layout. Separate floating containers can overlap when several operations report a result.

## Watch out
Keep one host per extension document, including the lookup iframe, because each document owns its React tree and viewport. Put progress in the same stack while the task runs.

In the code: UIProvider hosts the Mantine Notifications component. TaskAlerts sends task feedback to that host. Auto-bury notices use their review ID so undo can dismiss them.
