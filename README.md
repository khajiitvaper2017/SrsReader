# SrsReader

A local browser reader with dictionaries, word mining, and spaced repetition. Supports Chromium browsers and Firefox.

Website colouring follows layout changes without rescanning unchanged text. New subtitles and streamed text update only the affected text blocks. Sync status updates do not interrupt colouring.

Lookup footer actions share equal widths within their row, keeping their midpoint aligned with the review-rating row regardless of label length.

Dictionary lookup omits unresolved reference-only meanings when the same headword and reading have a real definition. Resolvable references and standalone unresolved references remain available.

Dictionary grammar matching recognizes `m`, `masc`, `masculine`, and `mask` as masculine gender tags.

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

## Google Drive build configuration

Opt-in sync publishes immutable, compressed per-device revisions and content-addressed media in Google Drive's hidden application-data folder. Learning changes and revision metadata are committed together; incoming changes do not become locally authored edits. Dictionaries, models, and caches are not synchronized. Device identity, transfer state, and credentials are neither synchronized nor replaced by backup restoration.

Sync settings shows Drive-reported storage usage, file count, and the last check time. Usage refreshes when the Sync section opens, after sync, or through its refresh action, and includes retained snapshots and all uploaded media. Individual files remain hidden from Drive's file browser; Drive → Settings → Manage apps provides the external hidden app-data usage view.

After the initial file scan, sync uses Drive's app-data change feed and a persisted, account-bound cursor instead of listing the entire folder again. Unchanged runs check metadata only; they do not download snapshots or upload another revision. Published local revisions are not downloaded back to the same device. Incoming snapshots reuse matching immutable media already stored locally, with SHA-256 and byte-length validation before merging.

The toolbar popup's sync button runs sync immediately when connected, or opens Sync settings when connection or authorization is needed. It shows an in-progress state and sync errors. Opening the popup reads local sync status without fetching Drive storage metadata.

Enable the Drive API and register the clients under one Google Cloud project. Set these build-time environment variables, for example in an untracked `.env.local`:

- `WXT_GOOGLE_CLIENT_ID`: a Chrome Extension OAuth client registered for extension ID `nlmfchmfabficodmhaioejabcbdaekjh`.
- `WXT_GOOGLE_FIREFOX_CLIENT_ID`: a Web application OAuth client for Firefox.
- `WXT_GOOGLE_REDIRECT_URI`: the exact HTTPS callback registered for the Firefox client, on an authorized, verified domain. The extension intercepts its correlated callback tab; no OAuth backend is used.

Both clients request `drive.appdata`, `openid`, and `email`. Do not bundle a client secret. Chromium uses its native identity token flow. Firefox, including its Android path, uses Google's documented token-response flow because Android lacks the extension identity API; Google classifies this flow as legacy and recommends newer alternatives where available. Bearer tokens stay in browser session storage; restarting the browser renews authorization using the retained account binding.

Without client configuration, Settings explains the missing configuration and disables connection. Live Google sign-in, cross-client application-data access, and Android behavior still require verification with registered clients and target devices. Android suspension can delay automatic sync.
