# @guneriu/pi-files

## 0.3.0

### Minor Changes

- **Diff-first peek for modified files**

  When you press `Space` to peek at a file the agent has edited this session, the view now opens in **diff mode** by default — red lines for removed content, green for added — compared against the session baseline captured at the moment of the first edit. Press `d` inside the peek to toggle between diff view and full file content; press `d` again to switch back.

  - `buildUnifiedDiff` computes a unified diff between the pre-edit baseline and current content.
  - `getGitBaseline` falls back to the last committed version when no in-session baseline is available.
  - The baseline is captured once per file at first edit and kept for the whole session; it is migrated correctly when a file is renamed via `bash mv`.
  - The hint bar shows `[diff·git] +N −N  d content  ↑↓ g/G  spc close` while in diff mode.
  - New (untracked) files and files with no detectable changes always open in content mode; a notification is shown if you press `d` on them.
  - Resolved an edge case where the git baseline path was computed relative to the agent root instead of the current working directory, causing diffs to fail in monorepo setups.

## 0.2.0

### Minor Changes

- **Type-to-filter search** — start typing anywhere in the tree to instantly filter all project files; matched portion of each path is highlighted; `↑/↓`, `Enter`, and `Space` (peek) work on results; `Esc` clears filter and returns to tree.
- **Inline search header** — while filtering, the header shows `/ query▌  N results  esc clear` with a live result count.
- **Built-in markdown highlighter** — the in-TUI peek renders markdown with structural ANSI highlighting (headings, code blocks, lists, links); no external tools required.
- **Space toggles peek** — pressing `Space` on an already-open peek entry closes it; same key opens and closes.
- Interactive gitignore-aware project tree via `/pi-files`; auto-expands to edited files on open.

> Entries below this line predate Changesets and were backfilled from git history.
