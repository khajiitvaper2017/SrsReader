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

## Google Drive build configuration

Optional sync stores learning data in Google Drive's hidden application-data folder. Dictionaries, models, and caches are not synced.

Enable the Drive API and register both OAuth clients under one Google Cloud project. Set these build-time variables in an untracked `.env.local`:

- `WXT_GOOGLE_CLIENT_ID`: a Chrome Extension OAuth client registered for extension ID `nlmfchmfabficodmhaioejabcbdaekjh`.
- `WXT_GOOGLE_FIREFOX_CLIENT_ID`: a Web application OAuth client for Firefox.
- `WXT_GOOGLE_REDIRECT_URI`: the exact HTTPS callback registered for the Firefox client, on an authorized, verified domain.

Both clients request `drive.appdata`, `openid`, and `email`. Do not include a client secret. Without client configuration, sync connection is disabled.

Chromium uses its native identity flow. Firefox uses Google's legacy token-response flow without an OAuth backend. Live sign-in, cross-browser sync, and Android support still need verification with registered clients and target devices.
