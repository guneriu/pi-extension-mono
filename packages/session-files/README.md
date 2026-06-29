# @guneriu/pi-session-files

Track files in your [pi coding agent](https://pi.dev) session — context files loaded at startup, files read, and files modified.

## What it tracks

| Category | How detected |
|----------|-------------|
| 📄 **Context files** | `AGENTS.md`, `SYSTEM.md`, `CLAUDE.md` scanned from session's working directory; also captured from `before_agent_start` event |
| 📖 **Files read** | `read` tool calls in session history |
| ✏️ **Files modified** | `edit` and `write` tool calls in session history |

## Install

```bash
# From GitHub (includes all three extensions):
pi install git:github.com/guneriu/pi-extension-mono

# When published to npm:
pi install npm:@guneriu/pi-session-files
```

## Commands

```bash
/session-files                  # show all tracked files
/session-files --alpha          # sort alphabetically (default: by access frequency)
/session-files --frequency      # sort by access count
/session-files --read-only      # show only files read
/session-files --modified-only  # show only files modified
/session-files --context-only   # show only context files
```

## Example output

```
📋 Session Files Report
══════════════════════════════════════════════════

📄 Context Files (1):
  • /Users/you/project/AGENTS.md

📖 Files Read (4):
  • /Users/you/project/src/main.ts (3x)
  • /Users/you/project/package.json

✏️  Files Modified (2):
  • /Users/you/project/src/main.ts (2x)
  • /Users/you/project/README.md

──────────────────────────────────────────────────
📊 Summary: 6 total | 4 read | 2 modified
```

## Settings file

`<agentDir>/extensions/pi-session-files/settings.json`

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable tracking |
| `trackContext` | `true` | Show context files section |
| `trackReads` | `true` | Track `read` tool calls |
| `trackModified` | `true` | Track `edit`/`write` tool calls |
| `maxFilesToShow` | `0` | Max files shown per section (0 = no limit) |

## Limitations

- Only tracks pi's built-in `read`, `edit`, and `write` tools — bash file operations are not tracked
- Context files are detected by scanning the session's working directory (`ctx.sessionManager.getCwd()`). They also appear after the first LLM turn via the `before_agent_start` event
- `CLAUDE.md` is shown if it's a valid symlink (broken symlinks are skipped)

## License

MIT © Uğur Güneri
