# @guneriu/pi-session-files

Track files in your [pi coding agent](https://pi.dev) session.

Shows context files (AGENTS.md, SYSTEM.md, etc.), files read via the `read` tool, and files modified via `edit`/`write` tools.

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

## Limitations

- Only tracks pi's built-in `read`, `edit`, and `write` tools
- Third-party tools and bash file operations are not tracked

## License

MIT © Ugur Gueneri
