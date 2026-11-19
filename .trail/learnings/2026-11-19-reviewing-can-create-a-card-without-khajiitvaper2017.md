---
title: Reviewing can create a card without the mining delay
author: Khajiitvaper2017
date: 2026-11-19
branch: main
id: l-d3696f9c
scope: repo
status: active
src: agent
touches:
  - src/anki/import.ts
  - src/cards/model.ts
  - src/cards/storage.ts
  - src/lookup/components/Lookup.tsx
  - src/lookup/hooks/useLookupWord.ts
  - src/shared/i18n/locales/en.json
  - src/shared/i18n/locales/uk.json
  - src/srs/commands.ts
  - src/srs/components/ReviewSettings.tsx
  - src/srs/components/SessionSummary.tsx
---

## Decided
With next-day mining enabled, delay the first review only for cards explicitly mined without a rating, because a rating in the lookup popup already starts learning the card.

## Tried and ruled out
Using the card creation date alone would also delay a card created by its first rating. A word's original creation date can predate the card.

## Watch out
Compute eligibility using the current study-day cutoff so changing the cutoff or switching the option off takes effect immediately. Keep Study and lookup grading consistent.

In the code: explicit mining records minedAt on the new card. The reading grade path calls mine with the review source. minedCardDeferredUntil uses the configured rollover.
