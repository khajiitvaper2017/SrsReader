---
title: A persisted import flag does not prove that its host is running
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-28ab9717
scope: repo
status: active
src: agent
touches:
  - docs/en/dictionaries.md
  - docs/en/review.md
  - docs/uk/dictionaries.md
  - docs/uk/review.md
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - src/app/App.tsx
  - src/app/pages/DocsPage.tsx
  - src/app/pages/ReviewPage.tsx
---

## Decided
The import host announces readiness over a runtime port after registering its command listener. The background waits for this handshake before dispatching work. The host reconnects after a background restart, and background initialization resumes saved running tasks. If startup fails, persist an error so the UI and cleanup do not remain blocked by a stale running flag.

Publish completion and remove the corresponding temporary archive in one transaction before broadcasting dictionary changes. Progress updates must match the task's run ID and running status. A newly queued task must not lose its archive to the previous task's cleanup or be ignored when the previous run loop exits.

## Tried and ruled out
Sending a one-shot runtime message immediately after creating an offscreen document did not establish that its listener was ready. Saving completion only after invalidation left finished work marked running if the refresh did not finish. The dictionary cleanup guard checks persisted status; it is not evidence that a worker is active and should not be bypassed while an import can still resume.

## Watch out
Dictionary import can spend time cleaning incomplete revisions before processing banks. Report this phase explicitly. Opening an app page after restart must restart an unfinished import from its saved archive or show a clear missing-source error. Real-browser checks covered interruption/restart, preservation of installed dictionaries, consecutive imports, cleanup rejection during active work, cleanup after completion, and missing-source failure. Chromium's headless unpacked runtime.reload did not recreate the extension reliably in the fixture, so the recovery check closed and reopened the isolated browser profile instead.

In the code: src/imports/commands.ts, src/imports/host.ts, src/background/start.ts, src/dictionaries/management.ts, src/dictionaries/revisions.ts.
