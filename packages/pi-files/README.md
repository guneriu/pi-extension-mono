# @guneriu/pi-files

Shows the files the agent edited this session in a compact widget above the
input bar, and opens an interactive, gitignore-aware project tree on demand.

## Features

- **Compact widget** above the editor: `+` new / `M` modified, capped rows with
  `… +N more` overflow so a big change set never swamps the terminal.
- **Idle hint** when nothing is edited yet (toggle off in settings).
- **`/pi-files`** — full-screen tree overlay with
  keyboard navigation; auto-expands to your edited files on open.
  - **`Enter`** on a file opens it in your OS default app (macOS, Linux, Windows).
  - **`p`** on a file opens a scrollable, syntax-highlighted in-TUI preview.
- **`/pi-files-settings`** — interactive settings menu to toggle the widget,
  collapse it for the session, adjust row cap, set the peek size limit, and more.
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
| `Enter` | **Open the file in your OS default app** (expands a directory) |
| `p` | **Peek: in-TUI syntax-highlighted preview** (files only) |
| `→` | Expand a directory |
| `←` | Collapse a directory — or jump to its parent if already collapsed |
| `Esc` or `q` | Close the overlay |

### Opening files

- **`Enter`** launches the file with your operating system's default
  application (`open` on macOS, `xdg-open` on Linux, `start` on Windows). On a
  headless/SSH box with no GUI handler you'll get a notification instead.
- **`p`** opens a scrollable, syntax-highlighted preview *inside* pi — no need to
  leave the terminal. Scroll with `↑/↓`, page with `PgUp/PgDn`, jump with `g`/`G`,
  close with `Esc`/`q`.
  - Files larger than **Max peek size** (default 512 KB) are refused with a hint
    to open them externally instead.
  - Binary files are detected and refused (open them externally).

### Inside the settings menu (`/pi-files-settings`)

| Key | Action |
|---|---|
| `↑` / `↓` | Move between items |
| `Space` or `Enter` | Toggle a boolean setting |
| `←` / `→` | Decrease / increase **Max widget rows** (1–20) and **Max peek size** (64–8192 KB) |
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

In the settings menu, **Max peek size (KB)** is adjusted with `←/→` in 64 KB
steps (range 64 KB–8 MB).

### Session collapse

The settings menu also offers **Collapse this session** — a temporary hide that
lasts only until you close pi. Unlike `enabled`, it is never written to disk, so
the widget always comes back on the next session start without any manual action.

Use it when you want to free up screen space mid-session without permanently
disabling the feature.
