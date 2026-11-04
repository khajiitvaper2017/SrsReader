---
title: Separate layout items while preserving inline word fragments
author: Khajiitvaper2017
date: 2026-11-04
branch: main
id: l-197a554f
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/background/handle.ts
  - src/dictionaries/commands.ts
  - src/dictionaries/components/Meanings.tsx
  - src/dictionaries/contracts.ts
  - src/dictionaries/grammar.ts
  - src/dictionaries/lookup.ts
  - src/dictionaries/resolve.ts
---

## Decided
Insert a text separator when collection moves between separate rendered layout containers. Cache the nearest layout container per element while reading a block. Keep ordinary inline text and display:contents wrappers continuous.

## Tried and ruled out
Raw text-node concatenation merged the notification panel labels Benachrichtigungen and Einstellungen. Separating every DOM element would break Zuckerkristalle when Zucker is a link and kristalle is following inline text.

## Watch out
Keep Part offsets based on the collected text, including inserted separators. Verify lookup from both sides of an inline word and separate controls in inline-block, flex, grid and block layouts. The notification panel itself may require a signed-in Wikipedia account.

In the code: src/reader/blocks.ts createBlockReader readBlock.
