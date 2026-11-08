# SrsReader

A local browser reader with dictionaries, word mining, and spaced repetition. Supports Chromium browsers and Firefox.

## Build

Requires Node.js 24 or newer and pnpm 12.15.0. See the [pnpm installation guide](https://pnpm.io/installation) if pnpm is not installed.

```sh
pnpm install --frozen-lockfile
pnpm zip
pnpm zip:firefox
```

For automatic reloads, run `pnpm dev` or `pnpm dev:firefox` and load the development build from `.output/`.

- `pnpm typecheck` — check TypeScript.
- `pnpm fix` — apply ESLint fixes and Prettier formatting.
- `pnpm check:unused` — find unused code and dependencies.
- `pnpm test:e2e` — run extension checks in a temporary browser profile. First run `pnpm exec playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing Chromium executable.

### Persistent test browser

Run `pnpm test:browser` to start headless Chromium with a saved profile in `.test-browser/profile/`. It uses the current `.output/chrome-mv3/` build without rebuilding, resetting data, or importing dictionaries.

Connect Playwright with `chromium.connectOverCDP("http://127.0.0.1:9223")`. The endpoint is local-only and controls the test profile, not your normal browser.

Stop the command with Ctrl+C. After `pnpm build`, restart it to load the new extension code. Settings, dictionaries, and learning data survive restarts. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium executable; otherwise the command uses Playwright's installed Chromium.

### Common-action benchmarks

After `pnpm build`, run `pnpm test:browser` in another terminal with the saved German/Czech dictionaries, then `pnpm benchmark`. The saved reader must be unpaused, study both languages, allow `127.0.0.1`, and use automatic scanning with word colors and a mouse/key/hover lookup binding. Close active lookup popups first: cold measurements restart the extension worker (not the browser or its profile).

The headless suite measures initial viewport/full-page and incremental scroll scans, cold/warm word lookup and dictionary content paint, nested lookup, saving a custom word, vocabulary search/open, and study question/reveal/rating. Vocabulary and study use a disposable profile with 60+ local cards; saved settings and learning progress are never changed. No dictionary imports are performed.

Console output gives median/p95; raw samples, scan phase timings, signed RPC overhead residuals, action outcomes, and errors go to `test-results/action-benchmarks.json`. `BENCH_SAMPLES=7` changes repetitions (3–100, default 5); `BENCH_REPORT=/path/report.json` changes the report path. Failures exit nonzero; unmeasured actions are not passed or timed as skips. There are no timing thresholds. Content-paint metrics use browser event, iframe-session, or navigation timestamps. `totalMs` retains the automation-inclusive elapsed time, and `automationResidualMs` reports its difference from browser paint latency. Deliberate hover/search debounce delay is reported separately. “Cold” restarts the extension worker; the idle-prepared popup UI and OS/disk caches remain unchanged.

## Google Drive build configuration

Optional sync stores learning data in Google Drive's hidden application-data folder. Dictionaries, models, and caches are not synced.

The theme in **Settings → Appearance** stays on each device. Choose **System**, **Light**, **Dark**, or **OLED** (pure black). **System** follows the browser's color scheme.

Enable the Drive API and register both OAuth clients under one Google Cloud project. Set these build-time variables in an untracked `.env.local`:

- `WXT_GOOGLE_CLIENT_ID`: a Chrome Extension OAuth client registered for extension ID `nlmfchmfabficodmhaioejabcbdaekjh`.
- `WXT_GOOGLE_FIREFOX_CLIENT_ID`: a Web application OAuth client for Firefox.
- `WXT_GOOGLE_REDIRECT_URI`: the exact HTTPS callback registered for the Firefox client, on an authorized, verified domain.

Both clients request `drive.appdata`, `openid`, and `email`. Do not include a client secret. Without client configuration, sync connection is disabled.

Chromium uses its native identity flow. Firefox uses Google's legacy token-response flow without an OAuth backend. Live sign-in, cross-browser sync, and Android support still need verification with registered clients and target devices.
