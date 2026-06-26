# @guneriu/pi-agent-files

Shows the files the agent edited this session in a compact widget above the
input bar, and opens an interactive, gitignore-aware project tree on demand.

## Features

- **Compact widget** above the editor: `+` new / `M` modified, capped rows with
  `… +N more` overflow so a big change set never swamps the terminal.
- **Idle hint** when nothing is edited yet (toggle off in settings).
- **`/agent-files`** (alias **`/files`**) — full-screen tree overlay. Arrow keys
  move, `→`/Enter expand, `←` collapse / jump to parent, `Esc`/`q` close.
- Respects `.gitignore` via `git ls-files`; falls back to a filesystem walk
  outside git repos.

## Install

```bash
pi install npm:@guneriu/pi-agent-files
# or the whole mono:
pi install git:github.com/guneriu/pi-extension-mono
```

## Settings

`<agent-dir>/extensions/pi-agent-files/settings.json`:

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master on/off |
| `maxWidgetRows` | `6` | Max file rows in the compact widget |
| `showIdleHint` | `true` | Show the one-line hint when no edits yet |
