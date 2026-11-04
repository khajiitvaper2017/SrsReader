---
title: Split the dictionary form shown in the popup
author: Khajiitvaper2017
date: 2026-11-03
branch: main
id: l-680397e3
scope: repo
status: active
src: agent
touches:
  - docs/en/reading.md
  - docs/uk/reading.md
  - src/background/handle.ts
  - src/dictionaries/commands.ts
  - src/dictionaries/contracts.ts
  - src/dictionaries/lookup.ts
  - src/lookup/components/Lookup.tsx
  - src/lookup/hooks/useLookupWord.ts
  - src/lookup/model.ts
  - src/shared/i18n/locales/en.json
---

## Decided
Use the selected word's dictionary form for German compound links. When the parser supplies a lemma, that is the word shown in the popup.

## Tried and ruled out
A Chromium check on the standalone singular Korneigenschaft passed while the real Wikipedia lookup failed. The article contains Korneigenschaften. UDPipe correctly supplied the singular lemma, but the compound request still used the inflected surface.

## Watch out
Check the actual inflected text that the user clicked, not just the popup title. Replay the live parser response from the same sentence when verifying the lookup path.

In the code: src/lookup/hooks/useLookupWord.ts passes the selected word's lemma to germanCompoundParts.
