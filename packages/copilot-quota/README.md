# @guneriu/pi-copilot-quota

GitHub Copilot AI credit usage chip and cost tracking for [pi coding agent](https://pi.dev).

> ⚠️ **Uses an undocumented internal GitHub API** (`copilot_internal/user`). This endpoint has no stability guarantee and may change without notice.

## What it does

- **🤖 Quota chip** — shows remaining Copilot credits in the footer (`29.9k/50k`)
- **💰 Session cost** — tracks Copilot credit spend for the current session (`$0.110`)
- **↳ Subagent cost** — shows subagent credit spend alongside parent (`$0.110 ↳ $0.035`)
- **💳 `/copilot-rates`** — table of all model credit rates, highlights current model
- **↺ Refresh rates** — fetches latest rates from GitHub's official pricing YAML

## Install

```bash
# From GitHub (includes all three extensions):
pi install git:github.com/guneriu/pi-extension-mono

# When published to npm:
pi install npm:@guneriu/pi-copilot-quota
```

## Requirements

- [`gh` CLI](https://cli.github.com) authenticated to your GitHub host
- GitHub Copilot subscription

## Commands

| Command | Description |
|---------|-------------|
| `/copilot-usage` | Open settings dialog |
| `/copilot-rates` | Show credit rates per model |

## Settings (`/copilot-usage`)

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Show/hide the quota chip and cost display |
| `GitHub host` | `github.com` | Your GitHub host. Change via "⌨ Set GitHub host…" action |
| `Clear GITHUB_TOKEN` | `off` | Enable if GHE auth fails due to `GITHUB_TOKEN` env conflict |
| `Show metric` | `remaining` | Quota chip format: `remaining`, `used`, `percent`, `remaining+percent` |
| `Refresh every` | `10 min` | How often to poll the quota API |
| `Cost format` | `money` | Display costs as `money` ($0.110) or `credits` (11 cr) |
| `↺ Refresh quota now` | — | Force-refresh the quota chip immediately |
| `↺ Refresh rates from GitHub` | — | Fetch latest model credit rates from GitHub docs |

## Cost display formats

```
Money (default):   $0.110 ↳ $0.035
Credits:           11 cr ↳ 3 cr
No subagents:      $0.110
Disabled:          (hidden)
```

## How cost is calculated

Session cost reads `usage.cost.total` directly from pi's session data — pi registers official GitHub Copilot rates for the `github-copilot` provider, so this is always accurate. It includes:
- Input tokens
- Output tokens
- Cache reads (at 10% of input rate)
- **Cache writes (thinking tokens)** — e.g. 97% of cost when extended thinking is active

**1 AI credit = $0.01 USD** (official GitHub definition).

Subagent cost reads from `toolResult.details.results[].usage.cost` (scalar) in the parent session — works even with `--no-session` subagents.

> ⚠️ Only pi's built-in `subagent` tool is tracked. Third-party subagent extensions (`@tintinweb/pi-subagents`, `pi-crew`, etc.) use different tool names and will show $0.

## Credit rates (`/copilot-rates`)

Rates are fetched from [GitHub's official pricing YAML](https://github.com/github/docs/blob/main/data/tables/copilot/models-and-pricing.yml) via "Refresh rates". A hardcoded fallback is used until the first fetch.

Use `/copilot-usage` → "↺ Refresh rates from GitHub" to update.

## GHE setup

For GitHub Enterprise users:

1. Open `/copilot-usage`
2. Select "⌨ Set GitHub host…" → enter your GHE hostname (e.g. `ghe.mycompany.com`)
3. If the quota chip shows an auth error, enable "Clear GITHUB_TOKEN" → `on`

The `Clear GITHUB_TOKEN` setting is needed when your shell has `GITHUB_TOKEN` set to a `github.com` token that overrides the GHE keyring token.

## Settings file

`<agentDir>/extensions/pi-copilot-quota/settings.json`

## License

MIT © Ugur Gueneri
