# SrsReader

A local browser reader with dictionaries, word mining, and spaced repetition. Supports Chromium browsers and Firefox.

Lookup footer actions share equal widths within their row, keeping their midpoint aligned with the review-rating row regardless of label length.

Dictionary lookup omits unresolved reference-only meanings when the same headword and reading have a real definition. Resolvable references and standalone unresolved references remain available.

Numeral lookup uses ICU-compatible CLDR spell-outs in supported studied languages. The context-selected written number, year, or ordinal replaces the numeric popup heading, with no separate form panel. Parser dependencies and locale date names identify calendar readings; a four-digit value alone does not imply a year. The original lookup term, source range, dictionary identity, and normal lookup controls remain unchanged. Pronunciation searches both the original numeral and the selected written form, merging recordings under the original word identity; word TTS uses the selected written form. Ordinary words keep their selected-lemma pronunciation lookup. The studied-language selector lists ICU capability. Unsupported languages/readings are omitted, with no language substitution.

## Build

Requires Node.js 24 or newer and pnpm 12.15.0. See the [pnpm installation guide](https://pnpm.io/installation) if pnpm is not installed.

```sh
pnpm install --frozen-lockfile
pnpm zip
pnpm zip:firefox
```

For automatic reloads during development, run `pnpm dev` or `pnpm dev:firefox` and load the development build once. Keep the command running while you edit files.

Run `pnpm fix` to apply ESLint fixes and Prettier formatting; `pnpm typecheck` checks TypeScript.

Run `pnpm check:unused` to find unused files, exports, types, and dependencies. Run `pnpm fix:unused` to make unused exports and types private. Review unused files and dependencies before removing them. After cleanup, run `pnpm typecheck`, `pnpm exec eslint .`, and `pnpm build`.

Run end-to-end extension checks with `pnpm exec playwright install chromium`, then `pnpm test:e2e`. The checks use a temporary browser profile and do not access your normal profile. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium executable instead of the downloaded browser.
