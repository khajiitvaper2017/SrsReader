## Build and development

- Use Node.js 24 or newer and pnpm 12.15.0. Run `pnpm install --frozen-lockfile` to install from `pnpm-lock.yaml`. Installation also runs `wxt prepare`.
- Run `pnpm dev` for Chromium or `pnpm dev:firefox` for Firefox.
- Run `pnpm build` for Chromium or `pnpm build:firefox` for Firefox. WXT writes builds to `.output/`.
- Run `pnpm zip` or `pnpm zip:firefox` to create installable archives.
- Treat `.wxt/` and `.output/` as generated files. Do not edit them. Run `pnpm exec wxt prepare` if generated WXT types are missing.
- Always rebuild for chrome after finishing the work.

## Browser testing

- Keep browser checks headless. Do not open visible browser windows.
- For focused checks, connect Playwright to `http://127.0.0.1:9223`. If it is not running, start it with `pnpm test:browser`.
- Reuse `.test-browser/profile/` and its installed German and Czech dictionaries. Do not reset the profile, repeat setup, or reimport dictionaries for routine checks.
- The launcher uses the existing Chromium build. After rebuilding extension code, stop and restart the launcher to load it without losing data.
- Keep `pnpm test:e2e` isolated from this saved profile. Run only the checks needed for the change, not the full suite each time.
- If no browser executable is available, run `pnpm exec playwright install chromium` or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing Chromium executable.

## Phone updates

- Run `pnpm phone:update` when asked to update the phone. ADB must be on `PATH`, and the phone must authorize debugging.
- For Wi-Fi pairing, run `npx adb-qr` and scan its code in Android's Wireless debugging settings.
- The script waits for an authorized device. If several devices are connected, set `ANDROID_SERIAL` to a serial listed by `adb devices`.
- The script stages and verifies the archive, then updates the contents of `/sdcard/Download/Telegram/chrome-mv3/chrome-mv3` in place. Never move, delete, or replace that directory: Thorium's Android file-picker access depends on it. Dictionaries and browser data stay intact.
- Keep rollback copies inside the temporary staging folder, not in permanent backup directories. Delete them after a successful update or rollback. Retain a copy only if automatic rollback fails.
- Reload SrsReader in the phone browser to activate the update.
- If an earlier update broke the saved Android file-picker reference, use **Load unpacked** to select that same folder again. Do not uninstall the extension or clear its data.

## Benchmarks

- Build Chromium, start the saved test browser, then run `pnpm benchmark`.
- Keep the saved reader unpaused with German and Czech enabled, `127.0.0.1` allowed, automatic scanning, word colors, and a mouse/key/hover lookup binding. Close active lookup popups first.
- Reader and dictionary measurements use the saved profile. Vocabulary and study measurements use a disposable profile with 60+ local cards. Do not reimport dictionaries or change saved learning progress.
- Results include median/p95, raw samples, scan timings, RPC overhead, action outcomes, and errors. The default report is `test-results/action-benchmarks.json`. `BENCH_SAMPLES` accepts 3–100 repetitions (default 5); `BENCH_REPORT` sets another report path.
- “Cold” restarts only the extension worker, not the browser or profile. The prepared popup UI and OS/disk caches stay warm. Content-paint timings use browser event, iframe-session, or navigation timestamps; `totalMs` includes automation, and `automationResidualMs` reports its difference from browser paint latency. Hover/search debounce delay is separate.
- There are no timing thresholds. Failures exit nonzero; unmeasured actions must not be reported as passed or silently skipped.

## Linting and fixes

- Run `pnpm typecheck` to check TypeScript and `pnpm exec eslint .` to lint. There is no `lint` script.
- Run `pnpm format:check` to check Prettier formatting.
- Run `pnpm check:unused` to find unused code and dependencies.
- Run `pnpm fix` to apply ESLint fixes and Prettier formatting across the repo. `pnpm format` only applies formatting.
- For a small change, use `pnpm exec eslint <files> --fix` and `pnpm exec prettier --write <files>` to avoid unrelated edits.
- Fix the shared cause of a bug. Check its callers and keep changes within the requested scope.
- Do not add tests unless asked. If asked, add only end-to-end tests that check app behavior.
- Run checks that fit the change. Do not repeat checks the user already completed. Report any checks you did not run.

## Documentation

- Change `README.md` only when the user explicitly requests README or documentation work. A feature, bug fix, refactor, or script change does not require a README update.
- Keep `README.md` limited to the project overview and build/install instructions. Do not add sections for individual features, settings, implementation details, or bug fixes.
- Do not create user guides or documentation pages before version 1.0.0.
- Keep agent-only workflows in this file. Read and reuse existing instructions instead of duplicating them in README or adding another guide.

## Google Drive build configuration

- For Drive-enabled builds, enable the Drive API and register both OAuth clients in one Google Cloud project. Keep these build-time values in an untracked `.env.local`:
  - `WXT_GOOGLE_CLIENT_ID`: Chrome Extension OAuth client for extension ID `nlmfchmfabficodmhaioejabcbdaekjh`.
  - `WXT_GOOGLE_FIREFOX_CLIENT_ID`: Web application OAuth client for Firefox.
  - `WXT_GOOGLE_REDIRECT_URI`: Exact HTTPS callback registered for Firefox on an authorized, verified domain.
- Both clients request `drive.appdata`, `openid`, and `email`. Do not include a client secret. Without client configuration, sync connection is disabled.
- Chromium uses native identity. Firefox uses Google's legacy token-response flow without an OAuth backend. Live sign-in, cross-browser sync, and Android support need verification with registered clients and target devices.

## Project structure

- This is a WXT browser extension built with React and strict TypeScript. Use `@/` imports for `src/`.
- `entrypoints/` contains the background, website content script, app, toolbar popup, and lookup iframe entry points. Keep feature logic in `src/`.
- `src/app/` contains app navigation and pages. `src/reader/` scans text and controls website lookups. `src/lookup/` renders word details and nested dictionary lookups.
- Keep feature code in its own folder, such as `dictionaries/`, `languages/`, `vocabulary/`, `srs/`, or `audio/`. Put React components in `components/` and hooks in `hooks/`.
- Follow each feature's existing `client.ts`, `contracts.ts`, and `commands.ts` pattern for background requests. `src/background/` routes requests and broadcasts changes.
- `src/platform/` contains browser messaging, database storage, migrations, and write locks. Reuse these services.
- `src/shared/` contains shared UI, the Mantine theme, styles, and translations. Update both `src/shared/i18n/locales/en.json` and `uk.json` for UI text.
- `wxt.config.ts` defines extension permissions, browser settings, and bundled assets. `public/` contains static assets.

## UI standards

Mantine, the shared theme in `src/shared/ui/theme.ts`, and existing shared UI patterns form the project's design system. These standards apply to all UI work.

- Use Mantine for all UI controls and layouts. Import its components directly. Do not add another UI library or wrap Mantine components just to rename their props.
- Use themed Mantine `Select`, `MultiSelect`, or `Combobox` for dropdowns on every screen and at every viewport size. Do not use `NativeSelect`, raw `<select>` or `<option>` controls, or browser-native option menus.
- Before implementing UI behavior, check the installed Mantine version and official documentation.
- Prefer Mantine components and hooks over custom implementations.
- Only implement missing behavior after verifying the gap and explaining it in a progress update.
- Keep layouts compact and consistent with the shared theme.
- Reuse the shared theme's control sizes, variants, typography, and spacing. Use Mantine spacing and color tokens. Do not invent styles for each screen.
- Use `<Text variant="supporting">` for help text, descriptions, and metadata. The shared theme defines its smaller size and dimmed color.
- Do not set `size`, `fz`, `c="dimmed"`, `component="small"`, or local CSS to style supporting text. Change its appearance in `src/shared/ui/theme.ts`.
- Use Mantine layout components and style props before writing CSS. Add custom CSS only for behavior or content that Mantine cannot provide. Keep it small and scoped. Do not override Mantine globally or build a separate style system.
- Do not recreate buttons, inputs, selects, menus, switches, alerts, or progress bars with custom HTML and CSS. Native markup is allowed for structured dictionary content and Markdown.
- Keep the saved appearance setting as the source of truth. Support light, dark, and system appearance across all entry points. Do not add separate theme storage.
- Use React refs for DOM measurement and scrolling. Use explicit data attributes for reader exclusions. Do not make behavior depend on presentation classes or Mantine's internal DOM structure.
- Prevent accidental horizontal overflow. Let pages scroll vertically. Keep floating popups on screen and let long popup content scroll. Ensure menus and overlays work in their page or iframe.
- Preserve labels, keyboard access, visible focus, numeric limits, empty values, loading states, disabled states, and save errors. Give icon-only actions accessible names.
- Keep all UI text localized in English and Ukrainian. Allow room for longer translations and narrow screens.
- Use Mantine MCP and skills when relevant.

### UI consistency

- Before adding UI, use Trail to find existing shared and feature components. Reuse established patterns for page headers, forms, tables, navigation, and action placement.
- Express visual purpose with semantic variants and theme tokens. Add repeated visual roles to the shared theme. Do not bypass it with styling classes, raw colors, or repeated local overrides.
- Use heading components for headings instead of increasing text sizes. Use sentence case for interface labels.
- Keep reusable visual components independent of routing, storage, and network requests. Put feature behavior in feature hooks and services.
- Keep reusable component APIs small. Document their intended use and supported variants when adding or changing them.
- Review UI changes for duplicated controls, inconsistent patterns, and theme overrides. Use existing lint rules to catch violations.

<!-- trail:start -->

## Trail — repo context graph

This repo is indexed in `.trail/cache/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `trail map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `trail ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `trail grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `trail skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `trail callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `.trail/cache/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `trail ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `trail build` (deterministic,
no API key, $0).
<!-- trail:end -->
