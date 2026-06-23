# @guneriu/pi-session-files

Track files in your [pi coding agent](https://pi.dev) session.

Shows:
- **Context files** — AGENTS.md, SYSTEM.md, CLAUDE.md loaded by the session
- **Files read** — accessed via the `read` tool
- **Files modified** — edited via `edit` or `write` tools

## Install

```bash
pi install git:github.com/guneriu/pi-extension-mono
# or when published to npm:
pi install npm:@guneriu/pi-session-files
```

## Commands

```bash
/session-files                  # show all files
/session-files --alpha          # sort alphabetically
/session-files --frequency      # sort by access count (default)
/session-files --read-only      # show only read files
/session-files --modified-only  # show only modified files
/session-files --context-only   # show only context files
```

### Example output

```
📋 Session Files Report
══════════════════════════════════════════════════

📄 Context Files (1):
  • /Users/me/project/AGENTS.md

📖 Files Read (3):
  • /Users/me/project/src/index.ts  (4x)
  • /Users/me/project/package.json

✏️  Files Modified (2):
  • /Users/me/project/src/index.ts  (2x)
  • /Users/me/project/src/utils.ts

──────────────────────────────────────────────────
📊 Summary: 5 total | 3 read | 2 modified
```

## Context file detection

Context files (AGENTS.md, SYSTEM.md, CLAUDE.md) are captured from:
1. `before_agent_start` event — most reliable, fires when the LLM turn begins
2. Filesystem scan of `session.getCwd()` — fallback if event hasn't fired yet

Files are detected from the **session's original working directory** (where `pi` was invoked), not the current shell directory.

## Limitations

- Only tracks pi's built-in `read`, `edit`, and `write` tools
- Bash file operations (`cat`, `mv`, `rm`) are **not tracked** — too error-prone to parse reliably
- Context files appear after the first LLM turn (event timing)
- Files from subagent sessions are not shown (subagents run in separate sessions)

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `trackContext` | `true` | Track context files (AGENTS.md etc.) |
| `trackReads` | `true` | Track files read via `read` tool |
| `trackModified` | `true` | Track files edited via `edit`/`write` tools |
| `maxFilesToShow` | `0` | Max files per section (0 = show all, read section caps at 20) |

Settings file: `<agentDir>/extensions/pi-session-files/settings.json`

## License

MIT © Ugur Gueneri
