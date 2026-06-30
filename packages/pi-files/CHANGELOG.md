# @guneriu/pi-files

## 0.2.0

### Minor Changes

- **Type-to-filter search** — start typing anywhere in the tree to instantly filter all project files; matched portion of each path is highlighted; `↑/↓`, `Enter`, and `Space` (peek) work on results; `Esc` clears filter and returns to tree.
- **Inline search header** — while filtering, the header shows `/ query▌  N results  esc clear` with a live result count.
- **Built-in markdown highlighter** — the in-TUI peek renders markdown with structural ANSI highlighting (headings, code blocks, lists, links); no external tools required.
- **Space toggles peek** — pressing `Space` on an already-open peek entry closes it; same key opens and closes.
- Interactive gitignore-aware project tree via `/pi-files`; auto-expands to edited files on open.

> Entries below this line predate Changesets and were backfilled from git history.
