# @guneriu/pi-agent-files

Shows the files the agent edited this session in a compact widget above the
input bar, and opens an interactive, gitignore-aware project tree on demand.

## Features

- **Compact widget** above the editor: `+` new / `M` modified, capped rows with
  `… +N more` overflow so a big change set never swamps the terminal.
- **Idle hint** when nothing is edited yet (toggle off in settings).
- **`/agent-files`** (alias **`/files`**) — full-screen tree overlay with
  keyboard navigation; auto-expands to your edited files on open.
- **`/agent-files-settings`** — interactive settings menu to toggle the widget,
  collapse it for the session, adjust row cap, and more.
- Respects `.gitignore` via `git ls-files`; falls back to a filesystem walk
  outside git repos.

## Install

```bash
pi install npm:@guneriu/pi-agent-files
# or the whole mono:
pi install git:github.com/guneriu/pi-extension-mono
```

## Commands & shortcuts

### Slash commands

| Command | Description |
|---|---|
| `/agent-files` | Open the interactive project tree overlay |
| `/files` | Alias for `/agent-files` |
| `/agent-files-settings` | Open the settings menu |

### Inside the project tree (`/agent-files`)

| Key | Action |
|---|---|
| `↑` / `↓` | Move selection |
| `→` or `Enter` | Expand a directory |
| `←` | Collapse a directory — or jump to its parent if already collapsed |
| `Esc` or `q` | Close the overlay |

### Inside the settings menu (`/agent-files-settings`)

| Key | Action |
|---|---|
| `↑` / `↓` | Move between items |
| `Space` or `Enter` | Toggle a boolean setting |
| `←` / `→` | Decrease / increase **Max widget rows** (1–20) |
| `Esc` or `q` | Close the menu |

## Settings

Settings can be changed interactively via `/agent-files-settings` or by editing
`<agent-dir>/extensions/pi-agent-files/settings.json` directly.

| Key | Default | Meaning | Persists? |
|---|---|---|---|
| `enabled` | `true` | Master on/off for the widget | ✅ yes |
| `maxWidgetRows` | `6` | Max file rows shown in the compact widget | ✅ yes |
| `showIdleHint` | `true` | Show a one-line hint when no files have been edited yet | ✅ yes |

### Session collapse

The settings menu also offers **Collapse this session** — a temporary hide that
lasts only until you close pi. Unlike `enabled`, it is never written to disk, so
the widget always comes back on the next session start without any manual action.

Use it when you want to free up screen space mid-session without permanently
disabling the feature.
