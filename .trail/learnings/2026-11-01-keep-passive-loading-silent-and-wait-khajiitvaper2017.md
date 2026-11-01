---
title: Keep passive loading silent and wait for real data before showing empty states
author: Khajiitvaper2017
date: 2026-11-01
branch: main
id: l-f9e7cca3
scope: repo
status: active
src: agent
touches:
  - src/app/App.tsx
  - src/app/pages/PopupPage.tsx
  - src/app/pages/SearchPage.tsx
  - src/app/pages/SettingsPage.tsx
  - src/app/pages/StudyPage.tsx
  - src/app/pages/WordsPage.tsx
  - src/cards/components/CardViewer.tsx
  - src/languages/components/LanguageDataSettings.tsx
  - src/languages/hooks/useLanguageData.ts
  - src/lookup/components/Lookup.tsx
---

## Decided
The user wants fast page opens, lookups, and local reads to stay quiet. Do not add page spinners or loading text for these transitions. Render data-dependent content when its data is ready, and retain the current content during refreshes. Unknown data must not appear as zero counts, missing dictionaries, missing decks, or uninstalled language data.

Show errors immediately. Keep explicit import/download progress. Generic action feedback waits 300 ms so short actions do not flash a Working notification.

## Tried and ruled out
Rendering empty defaults before requests finish briefly shows the wrong screen. Replacing that flash with a spinner still creates an unwanted intermediate display. Removing the visible spinner must not remove the underlying busy guards or timer pause markers.

## Watch out
Keep review frames mounted and preserve the displayed card until its replacement is ready. The earlier permission to show a loader before the first card does not require a loader; the user's current preference is silent initial loading. Match language-data results to their language so switching tabs never displays the previous language's installation state.

In the code: src/app/App.tsx, src/app/pages/PopupPage.tsx, src/shared/ui/TaskAlerts.tsx, src/cards/components/CardViewer.tsx, src/languages/hooks/useLanguageData.ts.
