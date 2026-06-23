# @guneriu/pi-copilot-quota

GitHub Copilot AI credit usage chip and cost tracking for [pi coding agent](https://pi.dev).

Shows your Copilot quota in the footer, tracks session and subagent costs using pi's official Copilot billing rates, and provides a `/copilot-rates` table for per-model credit pricing.

> ⚠️ **Uses an undocumented internal GitHub API** (`copilot_internal/user`). This endpoint has no stability guarantee and may change or be removed without notice.

## Install

```bash
# All extensions together (recommended):
pi install git:github.com/guneriu/pi-extension-mono

# npm (once published):
pi install npm:@guneriu/pi-copilot-quota
```

## Commands

| Command | Description |
|---------|-------------|
| `/copilot-usage` | Open settings dialog |
| `/copilot-rates` | Show credit rates table for all models |

### `/copilot-usage` settings

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Show/hide the quota chip and cost tracking |
| `GitHub host` | `github.com` | Your GitHub host. Use `Set GitHub host…` to type a custom GHE hostname |
| `Clear GITHUB_TOKEN` | `off` | Set to `on` if GHE auth fails (GITHUB_TOKEN env var conflict) |
| `Show metric` | `remaining` | Quota chip display: `remaining`, `used`, `percent`, `remaining+percent` |
| `Refresh every` | `10 min` | How often to refresh the quota chip |
| `Cost format` | `money` | Display cost as `$0.110` (money) or `11 cr` (credits) |
| `↺ Refresh quota now` | — | Force-refresh the quota chip immediately |
| `↺ Refresh rates from GitHub` | — | Fetch latest model credit rates from GitHub's official pricing YAML |

### `/copilot-rates` output

```
  Copilot Credit Rates  (fetched 6/23/2026)
  1 credit = $0.01  ·  rates per 1M tokens

  Model                    Input    Cached    Output
  ─────────────────────────────────────────────────
  gpt-5-mini                  25 cr    2 cr    200 cr
▶ claude-sonnet-4.5          300 cr   30 cr  1,500 cr  ← current model
  claude-opus-4.6            500 cr   50 cr  2,500 cr
```

## Footer integration

When used with `@guneriu/pi-footer`, the footer shows:

```
$0.110 ↳ $0.035   🤖 29.9k/50.0k
  ↑ session cost   ↑ subagent   ↑ quota remaining
```

- `$0.110` = parent session Copilot cost (from `usage.cost.total`, accurate)
- `↳ $0.035` = subagent costs (pi's built-in `subagent` tool only)
- `🤖 29.9k/50.0k` = credits remaining from your monthly quota

## Cost calculation

Costs use `usage.cost.total` directly from pi's session data. Pi registers the official GitHub Copilot rates, so this is always accurate and includes all token types: input, output, cache reads, and **cache writes (thinking tokens)**.

Subagent costs are read from `toolResult.details.results[].usage.cost` in the parent session branch — this works even with ephemeral subagents (`--no-session`).

> **Limitation:** Subagent cost tracking only works with pi's built-in `subagent` tool.  
> Third-party subagent extensions (`@tintinweb/pi-subagents`, `pi-crew`, etc.) use different tool names and are not counted.

## Requirements

- [`gh` CLI](https://cli.github.com) authenticated to your GitHub host
- GitHub Copilot subscription (for quota chip)

## License

MIT © Ugur Gueneri
