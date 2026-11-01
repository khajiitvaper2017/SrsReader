---
title: Use themed dropdowns on every screen
author: Khajiitvaper2017
date: 2026-10-28
branch: main
id: l-d585fdb8
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - src/app/pages/DocsPage.tsx
  - src/app/pages/SettingsPage.tsx
  - src/dictionaries/components/FrequencyBrowser.tsx
  - src/dictionaries/components/WiktionaryBrowser.tsx
  - src/shared/ui/theme.ts
  - src/vocabulary/components/CardEditor.tsx
---

## Decided
Use Mantine Select, MultiSelect, or Combobox with the shared theme for every app dropdown, including narrow-screen navigation and dialogs. The user explicitly rejects browser-native option menus. The rule is also in AGENTS.md.

## Tried and ruled out
NativeSelect was used as a compact replacement for segmented controls. Its closed field uses the theme, but its opened options use the browser or operating system appearance. Replacing only the reported instances left the same problem in navigation, catalog filters, and the card editor.

## Watch out
Check the whole source tree for NativeSelect and raw select/option controls. Keep empty-string filter options when converting to Select data. Select onChange supplies the selected value, not a DOM event. Keep the shared allowDeselect=false setting and localized labels.

In the code: src/shared/ui/theme.ts configures Select and its dropdown placement. AGENTS.md prohibits browser-native option menus. src/app/pages/SettingsPage.tsx and DocsPage.tsx use themed dropdown navigation on narrow screens.
