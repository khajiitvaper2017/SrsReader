---
title: Keep review example selection local and show one sentence at a time
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-8cdd808d
scope: repo
status: active
src: agent
touches:
  - docs/en/review.md
  - docs/uk/review.md
  - package.json
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - src/app/App.tsx
  - src/app/pages/DocsPage.tsx
  - src/app/pages/ReviewPage.tsx
  - src/app/pages/StudyPage.tsx
  - src/audio/components/AudioButton.tsx
---

## Decided
Saved-card reviews rank sentence candidates using cached word identities and known-word status. They do not send every candidate to UDPipe before displaying a card. Word-front cards render while sentence choices load; sentence-front cards wait for the selected sentence. The host's existing next-example control switches one sentence field at a time.

The default native template no longer renders its entire Examples field. Update existing reader note types without changing saved field values, note/card identities, scheduling or history. Preserve imported templates.

## Tried and ruled out
The old sentence selector parsed batches of 20 candidates and resolved live dictionary definitions to choose examples by part of speech. That was used by live definition rendering, while the unified viewer uses saved definitions. The user's log showed 150 ms to more than 3 seconds per UDPipe batch, repeated across cards. Waiting for this work before showing even a word-front card delayed every transition.

## Watch out
Keep inflected surface matches from saved sentence-token links and retain the existing ranking of reading examples before corpus examples. Do not concatenate all candidates into the visible card. A real browser check delayed sentence responses by 1.5 seconds and verified that the word was visible first and the next-example button replaced the one displayed sentence.

In the code: src/examples/sentences.ts, src/srs/commands.ts, src/cards/defaults.ts, src/platform/database/migrations.ts, src/app/pages/ReviewPage.tsx.
