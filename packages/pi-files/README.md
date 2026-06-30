# @guneriu/pi-files

Shows the files the agent edited this session in a compact widget above the
input bar, and opens an interactive, gitignore-aware project tree on demand.

## Features

- **Compact widget** above the editor: `+` new / `M` modified, capped rows with
  `… +N more` overflow so a big change set never swamps the terminal.
- **Idle hint** when nothing is edited yet (toggle off in settings).
- **`/pi-files`** — full-screen tree overlay with keyboard navigation;
  auto-expands to your edited files on open.
  - **`Enter`** opens the selected file in your OS default app.
  - **`Space`** opens a scrollable, syntax-highlighted in-TUI peek (Quick Look style).
  - **`d`** (inside peek) toggles between **diff view** and full-content view for modified files.
  - **Type anything** to filter all project files instantly — no prefix needed.
- **Diff-first peek for modified files** — when you peek at a file the agent has edited,
  the view opens in diff mode by default: red for removed lines, green for added lines,
  compared against the session baseline (the file contents at session start). Press `d`
  to toggle back to the full file view at any time.
- **`/pi-files-settings`** — interactive settings menu to toggle the widget,
  collapse it for the session, adjust the row cap, set the peek size limit, and more.
- Respects `.gitignore` via `git ls-files`; falls back to a filesystem walk
  outside git repos.

## Install

```bash
pi install npm:@guneriu/pi-files
# or the whole mono:
pi install git:github.com/guneriu/pi-extension-mono
```

## Commands & shortcuts

### Slash commands

| Command | Description |
|---|---|
| `/pi-files` | Open the interactive project tree overlay |
| `/pi-files-settings` | Open the settings menu |

### Inside the project tree (`/pi-files`)

| Key | Action |
|---|---|
| `↑` / `↓` | Move selection |
| `Enter` | **Open file in OS default app** — expands a directory |
| `Space` | **Peek** — in-TUI syntax-highlighted preview (toggle: same key closes) |
| `d` | **Inside peek**: toggle diff view ↔ full-content view |
| `→` | Expand a directory |
| `←` | Collapse a directory — or jump to its parent if already collapsed |
| `Esc` | Close the overlay (clears filter first if one is active) |
| *any printable char* | **Filter** — type to search all project files instantly |
| `Backspace` | Remove last filter character; empty filter returns to tree view |

### Type-to-filter search

Start typing anywhere in the tree — no prefix key needed. The view switches to
a flat filtered list of **all** project files (including inside collapsed
directories) whose path contains your query (case-insensitive).

- The header shows `/ query▌  N results  esc clear` while filtering.
- Matched portion of each path is highlighted.
- `↑/↓`, `Enter`, and `Space` (peek) all work on filter results.
- `Esc` clears the filter and returns to the tree. `Esc` again closes the overlay.
- `Backspace` removes one character at a time; empties = back to tree.
- `→` / `←` expand/collapse are inactive while filtering.

### Opening files

- **`Enter`** launches the file with your OS default application (`open` on
  macOS, `xdg-open` on Linux, `start` on Windows). On a headless/SSH box with
  no GUI handler you'll get a notification instead.
- **`Space`** opens a scrollable, syntax-highlighted preview *inside* pi — no
  need to leave the terminal. Press `Space` again (or `Esc`/`q`) to close.
  - Scroll with `↑/↓`, page with `PgUp/PgDn`, jump to top/bottom with `g`/`G`.
  - Markdown files get structural highlighting (headings, code blocks, lists,
    links) via a built-in pure ANSI renderer — no extra tools required.
  - Files larger than **Max peek size** (default 512 KB) are refused with a
    hint to open them externally instead.
  - Binary files are detected and refused (open them externally).

#### Diff view (modified files)

When you peek at a file the agent has **modified** this session, the peek opens
in **diff mode** by default — red lines for what was removed, green for what was
added, compared against the session baseline (the file content at session start,
or the last committed version if the session baseline isn't available).

- The hint bar shows `[diff·git] +N −N  d content  ↑↓ g/G  spc close`.
- Press **`d`** to switch to the full file view; press **`d`** again to return to diff.
- If no baseline is available (new file, or identical content), diff mode is
  skipped and pi notifies you that no diff is available.
- New (untracked) files always open in content mode.

### Inside the settings menu (`/pi-files-settings`)

| Key | Action |
|---|---|
| `↑` / `↓` | Move between items |
| `Space` or `Enter` | Toggle a boolean setting |
| `←` / `→` | Decrease / increase a number setting |
| `Esc` or `q` | Close the menu |

## Settings

Settings can be changed interactively via `/pi-files-settings` or by editing
`<agent-dir>/extensions/pi-files/settings.json` directly.

| Key | Default | Meaning | Persists? |
|---|---|---|---|
| `enabled` | `true` | Master on/off for the widget | ✅ yes |
| `maxWidgetRows` | `6` | Max file rows shown in the compact widget | ✅ yes |
| `showIdleHint` | `true` | Show a one-line hint when no files have been edited yet | ✅ yes |
| `maxPeekBytes` | `524288` | Largest file (bytes) the in-TUI peek will render | ✅ yes |

In the settings menu, **Max widget rows** is adjusted with `←/→` (range 1–20)
and **Max peek size (KB)** in 64 KB steps (range 64 KB–8 MB).

### Session collapse

The settings menu also offers **Collapse this session** — a temporary hide that
lasts only until you close pi. Unlike `enabled`, it is never written to disk, so
the widget always comes back on the next session start without any manual action.

Use it when you want to free up screen space mid-session without permanently
disabling the feature.
