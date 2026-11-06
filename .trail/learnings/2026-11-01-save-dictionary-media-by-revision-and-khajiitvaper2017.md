---
title: Backup parser limits must allow large media values
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-839369b9
scope: repo
status: active
src: agent
touches:
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - patches/dexie-export-import@4.4.2.patch
---

The dexie-export-import parser's default 10 MiB value limit can reject its own exports when embedded fonts expand as base64. The parser-limit patch is required for round-tripping large media without changing the backup format or loading the whole backup as JSON.
