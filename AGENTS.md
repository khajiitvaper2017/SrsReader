## UI standards

The project uses Mantine. These standards apply to all UI work.

- Use Mantine for all UI controls and layouts. Import its components directly. Do not add another UI library or wrap Mantine components just to rename their props.
- Keep layouts compact and consistent with the shared theme.
- Reuse the shared theme's control sizes, variants, typography, and spacing. Use Mantine spacing and color tokens. Do not invent styles for each screen.
- Use Mantine layout components and style props before writing CSS. Add custom CSS only for behavior or content that Mantine cannot provide. Keep it small and scoped. Do not override Mantine globally or build a separate style system.
- Do not recreate buttons, inputs, selects, menus, switches, alerts, or progress bars with custom HTML and CSS. Native markup is allowed for structured dictionary content and Markdown.
- Keep the saved appearance setting as the source of truth. Support light, dark, and system appearance across all entry points. Do not add separate theme storage.
- Use React refs for DOM measurement and scrolling. Use explicit data attributes for reader exclusions. Do not make behavior depend on presentation classes or Mantine's internal DOM structure.
- Prevent accidental horizontal overflow. Let pages scroll vertically. Keep floating popups on screen and let long popup content scroll. Ensure menus and overlays work in their page or iframe.
- Preserve labels, keyboard access, visible focus, numeric limits, empty values, loading states, disabled states, and save errors. Give icon-only actions accessible names.
- Keep all UI text localized in English and Ukrainian. Allow room for longer translations and narrow screens.

<!-- graft:start -->

## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
