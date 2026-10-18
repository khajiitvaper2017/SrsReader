# SrsReader

A local browser reader with dictionaries, word mining, and spaced repetition. Supports Chromium browsers and Firefox.

Read the [user guide](docs/README.md), also available in the app’s **Docs** tab in English and Ukrainian.

## Build

Requires Node.js 22 or newer.

```sh
npm install
npm run zip
npm run zip:firefox
```

Load the builds using the [installation guide](docs/en/getting-started.md).

For development, use `npm run dev` or `npm run dev:firefox`. Run `npm run fix` to apply ESLint fixes and Prettier formatting; `npm run typecheck` checks TypeScript.
