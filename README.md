# pi-extension-mono

Pi coding agent extensions by [guneriu](https://github.com/guneriu).

## Extensions

| Package | Install | Description |
|---------|---------|-------------|
| [`@guneriu/pi-copilot-quota`](./packages/copilot-quota) | `pi install npm:@guneriu/pi-copilot-quota` | GitHub Copilot quota chip, session cost, `/copilot-rates` |
| [`@guneriu/pi-footer`](./packages/pi-footer) | `pi install npm:@guneriu/pi-footer` | Enhanced footer (requires pi-copilot-quota) |
| [`@guneriu/pi-session-files`](./packages/session-files) | `pi install npm:@guneriu/pi-session-files` | Track context, read, and modified files |
| [`@guneriu/pi-agent-files`](./packages/agent-files) | `pi install npm:@guneriu/pi-agent-files` | Agent-edited files widget + interactive project tree (`/agent-files`, `/files`) |

## Quick install (all three)

```bash
# From GitHub:
pi install git:github.com/guneriu/pi-extension-mono

# Local development:
pi install /path/to/pi-extension-mono
```

## Requirements

- [pi coding agent](https://pi.dev)
- [`gh` CLI](https://cli.github.com) (for `pi-copilot-quota` quota chip)
- GitHub Copilot subscription (for `pi-copilot-quota`)

## What you get

```
~/project  🌿 main  [my-session]
↑1.3k ↓32k 💾CH84.1%  [████░░] 26.9%/200k  $0.110 ↳ $0.035  🤖 29.9k/50k  claude-sonnet-4.6 · 🧠med
```

- **Footer** — tokens, cache %, context bar, Copilot cost with subagent breakdown, quota chip, model + thinking level
- **`/copilot-usage`** — quota settings, GitHub host config, cost format, rate refresh
- **`/copilot-rates`** — table of all model credit rates (highlighted for current model)
- **`/session-files`** — context files, files read, files modified in current session

## Development

```bash
# Install locally for testing
pi install ./pi-extension-mono

# After editing, reload in pi
/reload
```

## Publish order (npm)

Publish `copilot-quota` before `pi-footer` — `pi-footer` depends on it:

```bash
cd packages/copilot-quota && npm publish --access public
cd packages/pi-footer     && npm publish --access public
cd packages/session-files && npm publish --access public
```

## License

MIT © Ugur Gueneri
