# @guneriu/pi-footer

Enhanced footer for [pi coding agent](https://pi.dev) — replaces pi's default one-liner with a richer two-line layout.

## What it shows

```
~/path/to/project  🌿 branch  [session-name]
↑1.3k ↓32k 💾CH84.1%  [████░░] 26.9%/200k  $0.110 ↳ $0.035  🤖 29.9k/50k  claude-sonnet-4.6 · 🧠med
```

| Element | Description |
|---------|-------------|
| `~/path` | Current working directory (shortened) |
| `🌿 branch` | Git branch (or detached/no-git) |
| `[session-name]` | Pi session name (if set) |
| `↑input ↓output` | Token counts for the session |
| `💾 CH84.1%` | Cache hit percentage |
| `[████░░] 26.9%/200k` | Context window usage bar |
| `$0.110 ↳ $0.035` | Copilot session cost (parent ↳ subagent) |
| `🤖 29.9k/50k` | Copilot quota chip (from `@guneriu/pi-copilot-quota`) |
| `model · 🧠level` | Current model and thinking level |

### Thinking level indicators

| Level | Icon |
|-------|------|
| off | (none) |
| minimal | 💭 |
| low | 🤔 |
| medium | 🧠 |
| high | 🔥 |
| max | ⚡ |

## Install

```bash
# From GitHub (includes all three extensions):
pi install git:github.com/guneriu/pi-extension-mono

# When published to npm:
pi install npm:@guneriu/pi-footer
```

> **Requires** `@guneriu/pi-copilot-quota` for cost and quota display. Installed automatically with the mono-repo.

## Commands

| Command | Description |
|---------|-------------|
| `/custom-footer` | Toggle enhanced footer on/off (restores pi's default when off) |

## Cost display

Cost reads `usage.cost.total` from pi's session data — the same accurate number pi already tracks. The extension adds:
- **Credit-format conversion** (`$0.110` → `11 cr`) via `@guneriu/pi-copilot-quota` settings
- **Subagent cost breakdown** (`$0.110 ↳ $0.035`) — parent session ↳ subagent total

Without `@guneriu/pi-copilot-quota` installed: cost and quota sections are hidden.

## Settings file

`<agentDir>/extensions/pi-footer/settings.json`

```json
{ "enabled": true }
```

## License

MIT © Ugur Gueneri
