# pi-files Extension — Design

**Date:** 2026-06-26
**Package:** `@guneriu/pi-files`
**Status:** Approved (pending spec review)

## Goal

Replace the Terax-style file-explorer side panel with an in-pi file view:

1. A **compact, height-capped widget above the input bar** showing the files the
   agent edited this session.
2. An **on-demand, full-screen interactive expandable project tree** (overlay)
   for real browsing, with agent-edited files highlighted.

This gives at-a-glance awareness without a side panel, and never lets a large
change set swamp the terminal.

## Non-Goals

- Git diff viewing (out of scope; we only *respect* `.gitignore` for the tree).
- Editing/opening files from the tree (read-only navigation).
- Tracking reads or context files (that is `@guneriu/pi-session-files`'s job).

## User Decisions (locked)

| Decision | Choice |
|---|---|
| Presentation | Compact widget above editor + full popup tree |
| Tree scope | Full project tree, edited files highlighted |
| "Edited" detection | Track agent `write`/`edit` tool calls (no git needed) |
| Idle state | One-line hint when idle; compact edited list once edits land |
| Overflow | Cap ~6 file rows, `… +N more` overflow |
| Popup open state | Auto-expand to edited files |
| Ignore rules | Respect `.gitignore` (hide noise) |

## Architecture

Two files, both shipped with the package:

- `packages/pi-files/src/core.ts` — **pure logic, zero pi/TUI imports**
  (classification, widget line builder, tree builder, visible-rows DFS,
  git-output parsing). Independently unit-testable with Node's built-in test
  runner; no peer deps required.
- `packages/pi-files/extensions/pi-files.ts` — the discoverable extension
  (pi/TUI wiring) that imports from `../src/core`.

The core module lives outside `extensions/` so pi's directory-based extension
discovery only picks up `pi-files.ts` (which has the default export).

**Import convention:** the extension imports core **extensionless**
(`../src/core`, matching pi's loader / the proven `pi-footer` cross-file import);
the test files import `../src/core.ts` (Node's native test runner needs the
explicit extension). These intentionally differ.

**No cross-package imports** — the small amount of session-scan logic
overlapping `session-files` is re-implemented locally so the package is
independently deployable (`pi install npm:@guneriu/pi-files`).

### Components (logical sections within the one file)

1. **Settings** — `getAgentDir()` + `loadSettings()`/`saveSettings()` with
   `DEFAULTS`, mirroring the other packages. Keys: `enabled`, `maxWidgetRows`
   (default 6), `showIdleHint` (default true).

2. **Edit tracker** — module-scoped `Map<string /*absPath*/, "new" | "modified">`
   plus a `pending: Map<toolCallId, {abs, kind, existsBefore}>`.
   - **Live (commit on success):** `pi.on("tool_call")` for `write`/`edit` records
     pre-execution state — `existsSync(abs)` *before* the tool runs — keyed by
     `toolCallId`. `pi.on("tool_execution_end")` commits it to the tracker **only
     when `!isError`**, so failed writes/edits never appear. For `write` to an
     absent path → `"new"`, else `"modified"`; `edit` → `"modified"`. `"new"` is
     sticky (never downgraded; previous status is read before the re-insert).
   - **Reconstruct:** `pi.on("session_start")` clears the map and rebuilds from
     `ctx.sessionManager.getBranch()` (assistant `toolCall` blocks named
     `write`/`edit`, reading `block.arguments.path`). History cannot reveal the
     pre-write state, so reconstructed edits are classified `"modified"`.
   - Any change re-renders the widget.

3. **Widget** — `ctx.ui.setWidget("pi-files", factory, { placement: "aboveEditor" })`.
   - Settings are loaded **once per session** (at `session_start`), not on every
     tool call, to avoid disk I/O churn.
   - Idle (0 edits) + `showIdleHint`: one dim line `📁 /pi-files — file tree`.
   - Idle + `!showIdleHint`: `ctx.ui.setWidget("pi-files", undefined)`.
   - With edits: header `Edited files (N) · /pi-files` then up to
     `maxWidgetRows` rows **newest-first**, each `glyph + repo-relative path`
     (`+` new / `M` modified, themed). Overflow → `… +K more`. Repo-relative via
     `path.relative(cwd, abs)`.

4. **Tree popup** — `ctx.ui.custom(factory, { overlay: true, overlayOptions })`.
   - **File list source:** `git ls-files --cached --others --exclude-standard`
     (respects `.gitignore` exactly), filtering staged-but-deleted paths via
     `existsSync`. Fallback when not a git repo: recursive `readdirSync` excluding
     `.git` and `node_modules`.
   - Build a tree from that path list. Track an `expanded: Set<string>` of dir
     paths; **auto-expand** every ancestor dir of an edited file on open.
   - Render visible rows (DFS over expanded dirs) inside a bordered box, like
     `keybindings-help.ts`: `render(width) → string[]`, `invalidate()`,
     `handleInput(data)`. Body height is derived from `tui.terminal.rows` so the
     box never exceeds `maxHeight`. A 1-col cursor gutter holds the selection
     marker (so it never hides the expand caret). Edited files show glyph+color.
   - Keys: `↑/↓` move selection (with scroll), `→`/`Enter` expand dir (or no-op on
     file), `←` collapse dir / jump to parent, `Esc`/`q` close.

5. **Entry point** — `export default function (pi)`:
   - `session_start` (guard `ctx.mode === "tui"`): load settings, reconstruct
     tracker, render widget.
   - `session_shutdown`: clear state **and** clear the widget (`setWidget(undefined)`).
   - `tool_call` → capture pending pre-state; `tool_execution_end` → commit on
     success + re-render widget.
   - `registerCommand("pi-files", …)` and `registerCommand("files", …)` →
     open the tree popup. Both guard `ctx.mode === "tui"`.

### Data flow

```
tool_call(write/edit) ──► edit tracker map ──► setWidget(re-render)
session_start ──► rebuild map from getBranch() ──► setWidget
/pi-files | /files ──► git ls-files + map ──► ctx.ui.custom(overlay tree)
```

### Terminal-safety

The persistent widget is hard-capped at `maxWidgetRows + ~2` border lines. The
full (potentially huge) tree lives only inside the overlay, which owns the screen
and scrolls. So the always-on footprint is bounded regardless of change-set size.

## Imports

- `@earendil-works/pi-coding-agent`: `ExtensionAPI`, `getAgentDir`,
  `isToolCallEventType`
- `@earendil-works/pi-tui`: `matchesKey`, `Key`, `truncateToWidth`, `visibleWidth`
- `node:fs`, `node:path`, `node:child_process` (`execFileSync` for `git ls-files`)

## Testing

- **Unit (`src/core.ts`):** classification (`new` vs `modified`, sticky-new),
  widget line builder (capping + overflow text), tree builder (path list → nested
  nodes), visible-rows DFS over an `expanded` set, git-output parsing. Pure
  functions over plain inputs — run with `node --test` (type-stripping is default
  on Node ≥ 23.6; add `--experimental-strip-types` only on older Node),
  no peer deps needed.
- **Manual TUI smoke test:** load via `pi install ./pi-extension-mono` + `/reload`,
  run `/pi-files`, verify navigation, edited highlighting, idle hint, overflow.

## Files

```
packages/pi-files/
├── extensions/pi-files.ts      # discoverable extension (pi/TUI wiring)
├── src/core.ts                    # pure logic (no pi/TUI imports)
├── test/core.test.ts              # node:test unit tests
├── package.json                   # @guneriu/pi-files
├── README.md
└── LICENSE
```

Root `package.json`: add `"./packages/pi-files/extensions"` to `pi.extensions`.
Root `README.md`: add a table row.

## Open follow-ups (not in scope now)

- Optional keyboard shortcut (needs a non-conflicting `KeyId`; `ctrl+e` is taken
  by the editor "line end").
- Optional git status coloring as a future enhancement.
