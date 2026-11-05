# SrsReader

A local browser reader with dictionaries, word mining, and spaced repetition. Supports Chromium browsers and Firefox.

Lookup footer actions share equal widths within their row, keeping their midpoint aligned with the review-rating row regardless of label length.

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
