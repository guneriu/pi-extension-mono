# @guneriu/pi-footer

Enhanced two-line footer for [pi coding agent](https://pi.dev).

## Layout

```
~/path/to/project  (main) · session-name
↑1.3k ↓32k  💾CH84.1%  [████░░] 26.9%/200k  $0.110 ↳ $0.035  🤖 29.9k/50k  claude-sonnet-4.5 · 🧠 med
```

**Line 1:** current working directory · git branch · session name  
**Line 2:** token counts · cache hit % · context window bar · Copilot cost · quota chip · model · thinking level

## Install

```bash
pi install git:github.com/guneriu/pi-extension-mono
# or when published to npm:
pi install npm:@guneriu/pi-footer
```

> **Requires** `@guneriu/pi-copilot-quota` for cost display and quota chip.  
> If not installed, those sections are simply absent from the footer.

## Commands

| Command | Description |
|---------|-------------|
| `/custom-footer` | Toggle enhanced footer on/off (restores pi's default when off) |

## Footer sections explained

| Section | Example | Description |
|---------|---------|-------------|
| Tokens | `↑1.3k ↓32k` | Total input ↑ and output ↓ tokens this session |
| Cache hit | `💾 CH84.1%` | `cacheRead / (input + cacheRead + cacheWrite) × 100` |
| Context bar | `[████░░] 26.9%/200k` | Context window usage with visual bar |
| Cost | `$0.110` | Session cost from `usage.cost.total` (accurate, includes thinking tokens) |
| Subagent cost | `↳ $0.035` | Additional cost from subagents (pi built-in tool only) |
| Quota | `🤖 29.9k/50k` | From `@guneriu/pi-copilot-quota` chip |
| Model | `claude-sonnet-4.5` | Currently active model |
| Thinking | `🧠 med` | Thinking level indicator |

### Thinking level indicators

| Level | Display | Color |
|-------|---------|-------|
| minimal | 💭 min | muted |
| low | 🤔 low | dim |
| medium | 🧠 med | accent |
| high | 🔥 high | warning |
| xhigh | ⚡ max | error |

Models without reasoning support show the model name only (no thinking indicator).

## Cost display format

```
$0.110          ← parent session only
$0.110 ↳ $0.035 ← parent + subagent breakdown
11 cr           ← credits format (toggle in /copilot-usage)
11 cr ↳ 3 cr   ← credits with subagent
```

Cost reads `usage.cost.total` directly from pi's session data — accurate, includes
all token types (input, output, cacheRead, cacheWrite/thinking). Not a manual rate calculation.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | On/off (also toggled by `/custom-footer` command) |

Settings file: `<agentDir>/extensions/pi-footer/settings.json`

## License

MIT © Ugur Gueneri
